// 1080p 영상을 프레임 수·소리는 그대로 두고 3840×2160 으로만 늘린다 (동료의 홍보 영상을 4K 규격으로 낼 때)
// 사용: swift upscale.swift in.mp4 out.mp4
import AVFoundation

let src = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let out = URL(fileURLWithPath: CommandLine.arguments[2])
let vt = src.tracks(withMediaType: .video)[0]
let comp = AVMutableComposition()
let v = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try! v.insertTimeRange(vt.timeRange, of: vt, at: .zero)
if let at = src.tracks(withMediaType: .audio).first {
  let a = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
  try! a.insertTimeRange(vt.timeRange, of: at, at: .zero)
}
let k = 3840 / vt.naturalSize.width
let vc = AVMutableVideoComposition()
vc.renderSize = CGSize(width: 3840, height: 2160)
vc.frameDuration = vt.minFrameDuration.isValid && vt.minFrameDuration.seconds > 0 ? vt.minFrameDuration : CMTime(value: 1, timescale: 24)
let ins = AVMutableVideoCompositionInstruction(); ins.timeRange = CMTimeRange(start: .zero, duration: comp.duration)
let li = AVMutableVideoCompositionLayerInstruction(assetTrack: v); li.setTransform(CGAffineTransform(scaleX: k, y: k), at: .zero)
ins.layerInstructions = [li]; vc.instructions = [ins]
try? FileManager.default.removeItem(at: out)
let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPreset3840x2160)!
ex.videoComposition = vc; ex.outputURL = out; ex.outputFileType = .mp4
let s = DispatchSemaphore(value: 0); ex.exportAsynchronously { s.signal() }; s.wait()
if ex.status != .completed { print("FAILED", ex.error as Any); exit(1) }
print("done", out.lastPathComponent, comp.duration.seconds)
