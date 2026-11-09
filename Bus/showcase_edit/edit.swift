// 쇼케이스 영상 편집기 — ffmpeg 없이 AVFoundation 으로 녹화본 구간 + 레이아웃 장을 이어 4K H.264 로 내보낸다.
// 사용: swift edit.swift plan.json out.mp4
//
// plan.json: { "items": [ {"slide": "a.png", "dur": 5} | {"src": "x.mp4", "from": 12.3, "to": 20.1, "label": "로맨스"} ... ],
//              "subs": { "x.mp4": [ {"t": 71.0, "end": 74.8, "text": "..."} ] } }
// 구간마다 앞뒤 0.3초 암전·소리 페이드(이웃 구간의 페이드와 맞닿으면 겹침으로 거부돼 0.02초 띄운다). 자막은 원본 시각을 편집 시각으로 옮겨 구간 안에 든 것만 새긴다.
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
let aTrack = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
let layerIns = AVMutableVideoCompositionLayerInstruction(assetTrack: vTrack)
let audioParams = AVMutableAudioMixInputParameters(track: aTrack)
var cursor = 0.0
struct Placed { let start: Double; let dur: Double; let label: String? }
var placed: [Placed] = []
var subLayers: [(Double, Double, String)] = []
var assets: [String: AVURLAsset] = [:]

for it in items {
  var dur: Double
  if let png = it["slide"] as? String {
    dur = it["dur"] as! Double
    let a = AVURLAsset(url: stillClip(png, dur))
    try! vTrack.insertTimeRange(CMTimeRange(start: .zero, duration: cm(dur)), of: a.tracks(withMediaType: .video)[0], at: cm(cursor))
  } else {
    let src = it["src"] as! String
    let a = assets[src] ?? AVURLAsset(url: URL(fileURLWithPath: src)); assets[src] = a
    let from = it["from"] as! Double, to = it["to"] as! Double
    dur = to - from
    let range = CMTimeRange(start: cm(from), duration: cm(dur))
    try! vTrack.insertTimeRange(range, of: a.tracks(withMediaType: .video)[0], at: cm(cursor))
    try! aTrack.insertTimeRange(range, of: a.tracks(withMediaType: .audio)[0], at: cm(cursor))
    // 소리 페이드
    audioParams.setVolumeRamp(fromStartVolume: 0, toEndVolume: 1, timeRange: CMTimeRange(start: cm(cursor), duration: cm(FADE)))
    audioParams.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: CMTimeRange(start: cm(cursor + dur - FADE - 0.02), duration: cm(FADE)))
    for s in subs[src] ?? [] {
      let t = s["t"] as! Double, e = s["end"] as! Double
      let a0 = max(t, from), a1 = min(e + 0.6, to - 0.2)
      if a1 - a0 > 0.8 { subLayers.append((cursor + a0 - from, a1 - a0, s["text"] as! String)) }
    }
  }
  // 화면 암전 페이드 (앞뒤)
  layerIns.setOpacityRamp(fromStartOpacity: 0, toEndOpacity: 1, timeRange: CMTimeRange(start: cm(cursor), duration: cm(FADE)))
  layerIns.setOpacityRamp(fromStartOpacity: 1, toEndOpacity: 0, timeRange: CMTimeRange(start: cm(cursor + dur - FADE - 0.02), duration: cm(FADE)))
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
ins.layerInstructions = [layerIns]
vc.instructions = [ins]

// 자막 · 장르 이름 — Core Animation 레이어 (좌표는 왼쪽 아래가 원점)
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
for p in placed {
  guard let label = p.label else { continue }
  let img = textImage(label, size: 120, bold: true, color: CREAM, maxW: 1400, align: .left)
  let t = CALayer(); t.contents = img
  t.frame = CGRect(x: 130, y: CGFloat(H) - 120 - CGFloat(img.height), width: CGFloat(img.width), height: CGFloat(img.height))
  timed(t, p.start + 0.4, min(p.dur - 0.6, 6))
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
