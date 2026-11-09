// snap.swift in.html out.png — render HTML at 1920x1080 CSS px into a 3840x2160 PNG with WKWebView
import AppKit
import WebKit
let a = CommandLine.arguments
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
class D: NSObject, WKNavigationDelegate {
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
      let c = WKSnapshotConfiguration(); c.rect = CGRect(x: 0, y: 0, width: 1920, height: 1080); c.snapshotWidth = 1920
      w.takeSnapshot(with: c) { img, err in
        guard let img = img else { print("err", err as Any); exit(1) }
        var r = CGRect(x: 0, y: 0, width: 3840, height: 2160)
        let cg = img.cgImage(forProposedRect: &r, context: nil, hints: nil)!
        let rep = NSBitmapImageRep(cgImage: cg)
        try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[2]))
        print("ok", cg.width, cg.height); exit(0)
      }
    }
  }
}
let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1920, height: 1080), styleMask: [.borderless], backing: .buffered, defer: false)
let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1920, height: 1080))
win.contentView = wv
let d = D(); wv.navigationDelegate = d
let u = URL(fileURLWithPath: a[1])
wv.loadFileURL(u, allowingReadAccessTo: URL(fileURLWithPath: "/"))
app.run()
