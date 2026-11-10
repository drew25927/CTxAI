// 쇼케이스 영상 편집기 — ffmpeg 없이 AVFoundation 으로 녹화본 구간 + 레이아웃 장을 이어 4K H.264 로 내보낸다.
// 사용: swift edit.swift plan.json out.mp4
//
// plan.json: { "items": [ ... ], "subs": { "x.mp4": [ {"t": 71.0, "end": 74.8, "text": "..."} ] } }
//   {"slide": "a.png", "dur": 5, "audio": {"src": "x.mp4", "from": 16, "vol": 0.6}}   정지 장(문구 카드 포함) — audio 는 깔리는 소리
//   {"src": "x.mp4", "from": 12.3, "to": 20.1, "label": "로맨스", "caption": "무엇에 놀라는지"}   녹화 구간 (4K 가 아니면 화면에 맞게 늘림, "audio" 를 주면 원본 소리 대신 깔림, "box": true 면 caption 뒤에 어두운 띠)
//   {"tri": [{"src","from","cx"} ×3], "dur": 12.8, "turns": [[0,5.3],[5.3,8.8],[8.8,12.6]], "labels": [...], "head": "..."}
//       세 화면 비교 — 세로 띠 셋(1280px)에 같은 길이를 나란히 틀고, turns 동안 그 칸만 밝히고 그 칸의 소리를 튼다. cx 는 원본에서 띠를 자를 왼쪽 x.
//   모든 항목에 "fade" (기본 0.3초) — 앞뒤 암전·소리 페이드. 이웃 페이드와 맞닿으면 겹침으로 거부돼 0.02초 띄운다.
// 자막은 원본 시각을 편집 시각으로 옮겨 구간(세 화면은 그 칸의 차례) 안에 든 것만 새긴다.
import AVFoundation
import AppKit
import QuartzCore

let args = CommandLine.arguments
let plan = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [String: Any]
let outURL = URL(fileURLWithPath: args[2])
let items = plan["items"] as! [[String: Any]]
let subs = plan["subs"] as? [String: [[String: Any]]] ?? [:]
let W = 3840, H = 2160, FPS: Int32 = 30
let FADE = 0.3
let tmpDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("showcase_edit_slides")
try? FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
func cm(_ s: Double) -> CMTime { CMTime(seconds: s, preferredTimescale: 600) }

// 정지 장 → 해당 길이의 짧은 H.264 클립
func stillClip(_ png: String, _ dur: Double) -> URL {
  let url = tmpDir.appendingPathComponent((png as NSString).lastPathComponent + "_\(dur).mov")
  if FileManager.default.fileExists(atPath: url.path) { return url }
  let w = try! AVAssetWriter(outputURL: url, fileType: .mov)
  let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 20_000_000]])
  let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
  w.add(input); w.startWriting(); w.startSession(atSourceTime: .zero)
  let img = NSImage(contentsOfFile: png)!
  var r = CGRect(x: 0, y: 0, width: W, height: H)
  let cg = img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
  var pb: CVPixelBuffer?
  CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &pb)
  CVPixelBufferLockBaseAddress(pb!, [])
  let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: W, height: H, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: W, height: H))
  CVPixelBufferUnlockBaseAddress(pb!, [])
  let n = Int((dur * Double(FPS)).rounded())
  for i in 0...n {
    while !input.isReadyForMoreMediaData { usleep(1000) }
    ad.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: FPS))
  }
  input.markAsFinished()
  let sem = DispatchSemaphore(value: 0); w.finishWriting { sem.signal() }; sem.wait()
  return url
}

let comp = AVMutableComposition()
let vTrack = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let vTracks = [vTrack] + (0..<2).map { _ in comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)! }
let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let layerIns = vTracks.map { AVMutableVideoCompositionLayerInstruction(assetTrack: $0) }
let audioParams = AVMutableAudioMixInputParameters(track: aTrack)
var cursor = 0.0
struct Placed { let start: Double; let dur: Double; let label: String? }
var placed: [Placed] = []
var subLayers: [(Double, Double, String)] = []
var overlays: [(Double, Double, String, String)] = [] // 시작, 길이, 종류(caption·head·tri0..2·seams), 글
var assets: [String: AVURLAsset] = [:]
func asset(_ src: String) -> AVURLAsset { let a = assets[src] ?? AVURLAsset(url: URL(fileURLWithPath: src)); assets[src] = a; return a }
let EPS = 0.02

// 소리 한 조각: 원본 [from, from+dur) 을 편집 시각 at 에, 앞뒤 페이드
func addAudio(_ src: String, _ from: Double, _ dur: Double, at: Double, fade: Double, vol: Float = 1) {
  let a = asset(src)
  guard let t = a.tracks(withMediaType: .audio).first else { return }
  try! aTrack.insertTimeRange(CMTimeRange(start: cm(from), duration: cm(dur)), of: t, at: cm(at))
  audioParams.setVolumeRamp(fromStartVolume: 0, toEndVolume: vol, timeRange: CMTimeRange(start: cm(at + EPS), duration: cm(fade)))
  audioParams.setVolumeRamp(fromStartVolume: vol, toEndVolume: 0, timeRange: CMTimeRange(start: cm(at + dur - fade - EPS), duration: cm(fade)))
}
func addSubs(_ src: String, _ from: Double, _ to: Double, at: Double) {
  for s in subs[src] ?? [] {
    let t = s["t"] as! Double, e = s["end"] as! Double
    let a0 = max(t, from), a1 = min(e + 0.6, to - 0.15)
    if a1 - a0 > 0.8 { subLayers.append((at + a0 - from, a1 - a0, s["text"] as! String)) }
  }
}
func fadeVideo(_ li: AVMutableVideoCompositionLayerInstruction, _ start: Double, _ dur: Double, _ fade: Double, peak: Float = 1) {
  li.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: peak, timeRange: CMTimeRange(start: cm(start), duration: cm(fade)))
  li.setOpacityRamp(fromStartOpacity: peak, toEndOpacity: 0, timeRange: CMTimeRange(start: cm(start + dur - fade - EPS), duration: cm(fade)))
}

for it in items {
  var dur: Double
  let fade = it["fade"] as? Double ?? FADE
  if let png = it["slide"] as? String {
    dur = it["dur"] as! Double
    let a = AVURLAsset(url: stillClip(png, dur))
    try! vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: cm(dur)), of: a.tracks(withMediaType: .video)[0], at: cm(cursor))
    if let au = it["audio"] as? [String: Any] {
      addAudio(au["src"] as! String, au["from"] as! Double, dur, at: cursor, fade: max(fade, 0.5), vol: Float(au["vol"] as? Double ?? 1))
    }
    fadeVideo(layerIns[0], cursor, dur, fade)
  } else if let tri = it["tri"] as? [[String: Any]] {
    dur = it["dur"] as! Double
    let turns = it["turns"] as! [[Double]]
    let dim: Float = 0.38
    func op(_ i: Int, _ t: Double) -> Float { (turns[i][0] <= t && t < turns[i][1]) ? 1 : dim }
    for (i, p) in tri.enumerated() {
      let src = p["src"] as! String, from = p["from"] as! Double, cx = p["cx"] as? Double ?? 1280
      try! vTracks[i].insertTimeRange(CMTimeRange(start: cm(from), duration: cm(dur)), of: asset(src).tracks(withMediaType: .video)[0], at: cm(cursor))
      let li = layerIns[i]
      li.setCropRectangle(CGRect(x: cx, y: 0, width: 1280, height: Double(H)), at: cm(cursor))
      li.setTransform(CGAffineTransform(translationX: CGFloat(Double(i) * 1280 - cx), y: 0), at: cm(cursor))
      li.setCropRectangle(CGRect(x: 0, y: 0, width: W, height: H), at: cm(cursor + dur))
      li.setTransform(.identity, at: cm(cursor + dur))
      // 밝기: 들어올 때 0→첫 값, 차례가 바뀔 때마다 0.24초 램프, 나갈 때 →0
      li.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: op(i, 0), timeRange: CMTimeRange(start: cm(cursor), duration: cm(fade)))
      for b in turns.map({ $0[0] }) + turns.map({ $0[1] }) where b > 0.5 && b < dur - 0.5 {
        let a = op(i, b - 0.01), z = op(i, b + 0.01)
        if a != z { li.setOpacityRamp(fromStartOpacity: a, toEndOpacity: z, timeRange: CMTimeRange(start: cm(cursor + b - 0.12), duration: cm(0.24))) }
      }
      li.setOpacityRamp(fromStartOpacity: op(i, dur - 0.01), toEndOpacity: 0, timeRange: CMTimeRange(start: cm(cursor + dur - fade - EPS), duration: cm(fade)))
      // 그 칸의 차례에만 그 칸의 소리와 자막
      let tr = turns[i]
      addAudio(src, from + tr[0], tr[1] - tr[0], at: cursor + tr[0], fade: 0.12)
      addSubs(src, from + tr[0], from + tr[1], at: cursor + tr[0])
      if let labels = it["labels"] as? [String] { overlays.append((cursor + 0.3, dur - 0.6, "tri\(i)", labels[i])) }
    }
    overlays.append((cursor + 0.3, dur - 0.6, "seams", ""))
    if let head = it["head"] as? String { overlays.append((cursor + 0.3, dur - 0.6, "head", head)) }
  } else {
    let src = it["src"] as! String
    let from = it["from"] as! Double, to = it["to"] as! Double
    dur = to - from
    let st = asset(src).tracks(withMediaType: .video)[0]
    try! vTrack.insertTimeRange(CMTimeRange(start: cm(from), duration: cm(dur)), of: st, at: cm(cursor))
    let k = CGFloat(W) / st.naturalSize.width  // 1080p 클립은 4K 로 늘린다
    if abs(k - 1) > 0.01 {
      layerIns[0].setTransform(CGAffineTransform(scaleX: k, y: k), at: cm(cursor))
      layerIns[0].setTransform(.identity, at: cm(cursor + dur))
    }
    if let au = it["audio"] as? [String: Any] {  // 원본 소리 대신 깔리는 소리
      addAudio(au["src"] as! String, au["from"] as! Double, dur, at: cursor, fade: max(fade, 0.5), vol: Float(au["vol"] as? Double ?? 1))
    } else { addAudio(src, from, dur, at: cursor, fade: fade) }
    addSubs(src, from, to, at: cursor)
    fadeVideo(layerIns[0], cursor, dur, fade)
    if let c = it["caption"] as? String { overlays.append((cursor + 0.2, dur - 0.4, it["box"] as? Bool == true ? "captionBox" : "caption", c)) }
  }
  placed.append(Placed(start: cursor, dur: dur, label: it["label"] as? String))
  cursor += dur
}
let total = cursor
if aTrack.timeRange.duration.seconds < total - 0.01 {
  try? aTrack.insertEmptyTimeRange(CMTimeRange(start: aTrack.timeRange.end, duration: cm(total - aTrack.timeRange.end.seconds)))
}

let vc = AVMutableVideoComposition()
vc.renderSize = CGSize(width: W, height: H)
vc.frameDuration = CMTime(value: 1, timescale: FPS)
let ins = AVMutableVideoCompositionInstruction()
ins.timeRange = CMTimeRange(start: .zero, duration: cm(total))
// 세 화면 비교가 없는 판은 보조 트랙 둘이 비어 있다 — 빈 트랙을 합성에 넣으면 "Source frame missing" 으로 멈추니 뺀다
for (t, _) in zip(vTracks, layerIns).dropFirst() where t.segments.isEmpty { comp.removeTrack(t) }
ins.layerInstructions = zip(vTracks, layerIns).enumerated().filter { $0.offset == 0 || !$0.element.0.segments.isEmpty }.map { $0.element.1 }
vc.instructions = [ins]

// 자막 · 장르 이름 · 문구 — Core Animation 레이어 (좌표는 왼쪽 아래가 원점)
let parent = CALayer(); parent.frame = CGRect(x: 0, y: 0, width: W, height: H)
let videoLayer = CALayer(); videoLayer.frame = parent.frame
parent.addSublayer(videoLayer)
func timed(_ layer: CALayer, _ start: Double, _ dur: Double) {
  layer.opacity = 0
  let anim = CAKeyframeAnimation(keyPath: "opacity")
  anim.values = [0, 1, 1, 0]
  let f = min(0.25, dur / 4)
  anim.keyTimes = [0, NSNumber(value: f / dur), NSNumber(value: 1 - f / dur), 1]
  anim.beginTime = start == 0 ? AVCoreAnimationBeginTimeAtZero : start
  anim.duration = dur
  anim.isRemovedOnCompletion = false
  anim.fillMode = .both
  layer.add(anim, forKey: "o")
  parent.addSublayer(layer)
}
// 글자는 비트맵으로 미리 그려 레이어 contents 로 넣는다 — 내보내기에서 CATextLayer 는 글자가 그려지지 않았다(상자만 나옴)
// 글꼴은 포스터 타이포를 따른다 — 장르 이름 함렛 Black, 자막 본명조 Light, 크림색. fonts/ 의 가변 글꼴을 이 프로세스에만 등록한다.
let fontDir = URL(fileURLWithPath: args[0]).deletingLastPathComponent().appendingPathComponent("fonts")
for f in ["Hahmlet-VF.ttf", "NotoSerifKR-VF.ttf"] {
  let u = (ProcessInfo.processInfo.environment["SHOWCASE_FONTS"].map { URL(fileURLWithPath: $0) } ?? fontDir).appendingPathComponent(f)
  CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil)
}
let CREAM = NSColor(red: 0xF1 / 255.0, green: 0xE6 / 255.0, blue: 0xD2 / 255.0, alpha: 1)
func posterFont(_ family: String, weight: Double, size: CGFloat) -> NSFont {
  let wght = NSNumber(value: 0x77676874) // 'wght'
  let d = NSFontDescriptor(fontAttributes: [.family: family, .variation: [wght: weight]])
  return NSFont(descriptor: d, size: size) ?? NSFont.systemFont(ofSize: size)
}
func textImage(_ s: String, size: CGFloat, bold: Bool, color: NSColor, maxW: CGFloat, align: NSTextAlignment) -> CGImage {
  let para = NSMutableParagraphStyle(); para.alignment = align; para.lineBreakMode = .byWordWrapping
  let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.9); shadow.shadowBlurRadius = 10; shadow.shadowOffset = .zero
  let font = bold ? posterFont("Hahmlet", weight: 900, size: size) : posterFont("Noto Serif KR", weight: 300, size: size)
  let str = NSAttributedString(string: s, attributes: [.font: font, .foregroundColor: color, .paragraphStyle: para, .shadow: shadow])
  let b = str.boundingRect(with: CGSize(width: maxW, height: 2000), options: [.usesLineFragmentOrigin])
  let w = Int(ceil(min(maxW, b.width))) + 40, h = Int(ceil(b.height)) + 30
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  str.draw(with: CGRect(x: 20, y: 15, width: CGFloat(w - 40), height: CGFloat(h - 30)), options: [.usesLineFragmentOrigin])
  NSGraphicsContext.restoreGraphicsState()
  return rep.cgImage!
}
for (st, d, s) in subLayers {
  let img = textImage(s, size: 96, bold: false, color: CREAM, maxW: 3000, align: .center)
  let box = CALayer(); box.backgroundColor = NSColor.black.withAlphaComponent(0.45).cgColor; box.cornerRadius = 18
  let bw = CGFloat(img.width) + 60, bh = CGFloat(img.height) + 20
  box.frame = CGRect(x: (CGFloat(W) - bw) / 2, y: 140, width: bw, height: bh)
  let t = CALayer(); t.contents = img; t.frame = CGRect(x: 30, y: 10, width: CGFloat(img.width), height: CGFloat(img.height))
  box.addSublayer(t)
  timed(box, st, d)
}
// 장르 이름·세 화면 문구는 반투명 어두운 띠 위에 — 안개 낀 밝은 화면에서 크림색 글씨가 사라졌다(11/10 검토)
func boxed(_ img: CGImage, x: CGFloat, y: CGFloat) -> CALayer {
  let pad: CGFloat = 26
  let box = CALayer(); box.backgroundColor = NSColor.black.withAlphaComponent(0.5).cgColor; box.cornerRadius = 16
  box.frame = CGRect(x: x - pad, y: y - pad / 2, width: CGFloat(img.width) + pad * 2, height: CGFloat(img.height) + pad)
  let t = CALayer(); t.contents = img; t.frame = CGRect(x: pad, y: pad / 2, width: CGFloat(img.width), height: CGFloat(img.height))
  box.addSublayer(t)
  return box
}
for p in placed {
  guard let label = p.label else { continue }
  let img = textImage(label, size: 120, bold: true, color: CREAM, maxW: 1400, align: .left)
  timed(boxed(img, x: 130, y: CGFloat(H) - 130 - CGFloat(img.height)), p.start + 0.4, min(p.dur - 0.6, 6))
}
for (st, d, kind, text) in overlays {
  if kind == "seams" {
    // 포스터의 빛나는 경계처럼 칸 사이에 가는 크림색 선
    for x in [1280.0, 2560.0] {
      let l = CALayer(); l.backgroundColor = CREAM.withAlphaComponent(0.8).cgColor
      l.frame = CGRect(x: x - 2, y: 0, width: 4, height: Double(H))
      l.shadowColor = CREAM.cgColor; l.shadowRadius = 14; l.shadowOpacity = 0.9; l.shadowOffset = .zero
      timed(l, st, d)
    }
    continue
  }
  let isTri = kind.hasPrefix("tri")
  let img = textImage(text, size: kind == "head" ? 84 : isTri ? 100 : 92, bold: !kind.hasPrefix("caption"), color: CREAM, maxW: 3400, align: .center)
  let w = CGFloat(img.width), h = CGFloat(img.height)
  if isTri {
    let i = CGFloat(Int(String(kind.last!))!)
    timed(boxed(img, x: i * 1280 + (1280 - w) / 2, y: CGFloat(H) - 300 - h), st, d)
  } else if kind == "head" {
    timed(boxed(img, x: (CGFloat(W) - w) / 2, y: CGFloat(H) - 100 - h), st, d)
  } else if kind == "captionBox" {
    timed(boxed(img, x: (CGFloat(W) - w) / 2, y: 260), st, d)
  } else {
    let t = CALayer(); t.contents = img
    t.frame = CGRect(x: (CGFloat(W) - w) / 2, y: 260, width: w, height: h)
    timed(t, st, d)
  }
}
vc.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

let mix = AVMutableAudioMix(); mix.inputParameters = [audioParams]
try? FileManager.default.removeItem(at: outURL)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPreset3840x2160)!
ex.outputURL = outURL; ex.outputFileType = .mp4
ex.videoComposition = vc; ex.audioMix = mix
ex.shouldOptimizeForNetworkUse = true
let sem = DispatchSemaphore(value: 0)
ex.exportAsynchronously { sem.signal() }
while sem.wait(timeout: .now() + 10) == .timedOut { print(String(format: "  %.0f%%", ex.progress * 100)); fflush(stdout) }
if ex.status != .completed { print("FAILED", ex.error as Any); exit(1) }
print(String(format: "done %@ %.2fs", outURL.lastPathComponent, total))
