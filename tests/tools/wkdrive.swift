// テスト用の小道具（macOS のみ）：Safari と同じエンジン（WebKit）でページを開き、標準入力の命令どおりに操作して結果を返す。
// 画面には何も出さない（見えない窓の中で動かす）。Safari 本体・その設定・履歴には触らない。
//   swiftc -O tests/tools/wkdrive.swift -o <出力先>/wkdrive
//   wkdrive <幅> <高さ> [free]     … free を付けると「音つきの動画は操作の直後でないと再生できない」制限（Safari の既定）を外す
//   標準入力（1行1命令の JSON）:
//     {"id":1,"cmd":"goto","url":"http://… または file://…"}
//     {"id":2,"cmd":"eval","js":"文の並び。最後の式の値を JSON にして返す（Promise なら待つ）。利用者の操作ではない扱いで実行する"}
//     {"id":3,"cmd":"mouse","type":"down|up|move|drag","x":10,"y":20}        … 本物のマウス入力として渡す（ページの座標）
//     {"id":4,"cmd":"key","code":36,"chars":"\r","mods":0}                    … 本物のキー入力として渡す
//     {"id":5,"cmd":"files","paths":["/…/a.mov"]}                             … 次にファイル選択が開いたら、これを選んだことにする
//     {"id":6,"cmd":"shot","path":"/…/a.png"}
//     {"id":7,"cmd":"quit"}
//   標準出力（1行1件の JSON）: {"id":1,"ok":true,"value":…} ／ {"ev":"console","level":"error","text":"…"}
import AppKit
import WebKit

func emit(_ obj: [String: Any]) {
  guard let d = try? JSONSerialization.data(withJSONObject: obj, options: []), var s = String(data: d, encoding: .utf8) else { return }
  s += "\n"
  FileHandle.standardOutput.write(s.data(using: .utf8)!)
}

final class KeyWindow: NSWindow {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { true }
}

final class Driver: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  var web: WKWebView!
  var win: KeyWindow!
  var navId: Int? = nil
  var files: [URL] = []
  let W: CGFloat, H: CGFloat

  init(w: CGFloat, h: CGFloat, strictAutoplay: Bool) {
    W = w; H = h
    super.init()
    let cfg = WKWebViewConfiguration()
    cfg.websiteDataStore = .nonPersistent()                 // テストの保存データは残さない
    cfg.mediaTypesRequiringUserActionForPlayback = strictAutoplay ? .audio : []     // Safari の既定「音つきのメディアは自動再生しない」に合わせる
    let hook = """
    (() => {
      const post = (level, args) => { try { window.webkit.messageHandlers.wk.postMessage({ level, text: Array.from(args).map((a) => { try { return typeof a === 'string' ? a : (a && a.stack) || JSON.stringify(a); } catch (e) { return String(a); } }).join(' ') }); } catch (e) {} };
      ['log', 'info', 'warn', 'error'].forEach((k) => { const o = console[k]; console[k] = function () { post(k, arguments); return o.apply(console, arguments); }; });
      window.addEventListener('error', (e) => post('exception', [(e.message || 'error') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno]));
      window.addEventListener('unhandledrejection', (e) => post('exception', ['unhandledrejection: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)]));
    })();
    """
    cfg.userContentController.addUserScript(WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    cfg.userContentController.add(self, name: "wk")
    web = WKWebView(frame: NSRect(x: 0, y: 0, width: w, height: h), configuration: cfg)
    web.navigationDelegate = self
    web.uiDelegate = self
    // 見えない窓：画面の外に置き、「隠れているから止める」をさせない
    win = KeyWindow(contentRect: NSRect(x: -20000, y: -20000, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
    win.isReleasedWhenClosed = false
    win.contentView = web
    win.ignoresMouseEvents = false
    let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
    if web.responds(to: sel) {
      typealias Fn = @convention(c) (AnyObject, Selector, Bool) -> Void
      unsafeBitCast(web.method(for: sel), to: Fn.self)(web, sel, false)
    }
    win.orderFrontRegardless()
    win.makeFirstResponder(web)
  }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let d = m.body as? [String: Any] else { return }
    if let id = d["reply"] as? Int {          // eval の結果
      if (d["ok"] as? Bool) == true { emit(["id": id, "ok": true, "value": d["value"] ?? NSNull()]) } else { emit(["id": id, "ok": false, "error": d["error"] ?? "error"]) }
      return
    }
    emit(["ev": "console", "level": d["level"] ?? "log", "text": d["text"] ?? ""])
  }
  /* JavaScript を「利用者の操作ではない」扱いで実行する。
     公開されている evaluateJavaScript / callAsyncJavaScript は「操作の直後」扱いになり、自動再生の制限などが働かなくなるため、
     WebKit の検証用の入口（_evaluateJavaScriptWithoutUserGesture）を使う。なければ公開の入口で代用する。 */
  func run(_ js: String) {
    let sel = NSSelectorFromString("_evaluateJavaScriptWithoutUserGesture:completionHandler:")
    if web.responds(to: sel) {
      typealias Fn = @convention(c) (AnyObject, Selector, NSString, (@convention(block) (Any?, Error?) -> Void)?) -> Void
      unsafeBitCast(web.method(for: sel), to: Fn.self)(web, sel, js as NSString, nil)
    } else {
      web.evaluateJavaScript(js, completionHandler: nil)
    }
  }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) { if let id = navId { navId = nil; emit(["id": id, "ok": true, "value": "loaded"]) } }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { if let id = navId { navId = nil; emit(["id": id, "ok": false, "error": e.localizedDescription]) } }
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { if let id = navId { navId = nil; emit(["id": id, "ok": false, "error": e.localizedDescription]) } }
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { emit(["ev": "console", "level": "exception", "text": "web content process terminated"]) }
  // ファイル選択：あらかじめ渡されたファイルを選んだことにする
  func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
    emit(["ev": "openpanel", "n": files.count])
    completionHandler(files.isEmpty ? nil : files)
  }
  func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) { emit(["ev": "alert", "text": m]); completionHandler() }
  func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) { emit(["ev": "confirm", "text": m]); completionHandler(true) }

  func mouse(_ type: NSEvent.EventType, _ x: CGFloat, _ y: CGFloat, clicks: Int = 1) {
    let ev = NSEvent.mouseEvent(with: type, location: NSPoint(x: x, y: H - y), modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: win.windowNumber, context: nil, eventNumber: 0, clickCount: clicks, pressure: type == .leftMouseUp ? 0 : 1)!
    switch type {
    case .leftMouseDown: web.mouseDown(with: ev)
    case .leftMouseUp: web.mouseUp(with: ev)
    case .leftMouseDragged: web.mouseDragged(with: ev)
    default: web.mouseMoved(with: ev)
    }
  }
  func key(_ code: UInt16, _ chars: String, _ mods: UInt) {
    let flags = NSEvent.ModifierFlags(rawValue: mods)
    for t in [NSEvent.EventType.keyDown, .keyUp] {
      if let ev = NSEvent.keyEvent(with: t, location: .zero, modifierFlags: flags, timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: win.windowNumber, context: nil, characters: chars, charactersIgnoringModifiers: chars, isARepeat: false, keyCode: code) {
        if t == .keyDown { web.keyDown(with: ev) } else { web.keyUp(with: ev) }
      }
    }
  }

  func handle(_ m: [String: Any]) {
    let id = m["id"] as? Int ?? 0
    switch m["cmd"] as? String ?? "" {
    case "goto":
      guard let s = m["url"] as? String, let u = URL(string: s) else { emit(["id": id, "ok": false, "error": "bad url"]); return }
      navId = id
      if u.isFileURL { web.loadFileURL(u, allowingReadAccessTo: u.deletingLastPathComponent()) } else { web.load(URLRequest(url: u)) }
    case "eval":
      // 「文の並び。最後の式の値（Promise なら待つ）を JSON にして返す」。結果はメッセージで受け取る
      let src = m["js"] as? String ?? ""
      guard let enc = try? JSONSerialization.data(withJSONObject: [src], options: []), let arr = String(data: enc, encoding: .utf8) else { emit(["id": id, "ok": false, "error": "bad js"]); return }
      run("(async () => { const post = (o) => window.webkit.messageHandlers.wk.postMessage(o); try { const __v = await (0, eval)(\(arr)[0]); post({ reply: \(id), ok: true, value: JSON.stringify(__v === undefined ? null : __v) }); } catch (e) { post({ reply: \(id), ok: false, error: String((e && e.stack) || (e && e.message) || e) }); } })(); 0")
    case "mouse":
      let x = CGFloat((m["x"] as? NSNumber)?.doubleValue ?? 0), y = CGFloat((m["y"] as? NSNumber)?.doubleValue ?? 0)
      switch m["type"] as? String ?? "" {
      case "down": mouse(.leftMouseDown, x, y)
      case "up": mouse(.leftMouseUp, x, y)
      case "drag": mouse(.leftMouseDragged, x, y)
      default: mouse(.mouseMoved, x, y)
      }
      emit(["id": id, "ok": true, "value": NSNull()])
    case "key":
      key(UInt16((m["code"] as? NSNumber)?.intValue ?? 0), m["chars"] as? String ?? "", UInt((m["mods"] as? NSNumber)?.intValue ?? 0))
      emit(["id": id, "ok": true, "value": NSNull()])
    case "files":
      files = (m["paths"] as? [String] ?? []).map { URL(fileURLWithPath: $0) }
      emit(["id": id, "ok": true, "value": NSNull()])
    case "shot":
      let path = m["path"] as? String ?? ""
      web.takeSnapshot(with: nil) { img, err in
        guard let img = img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) else { emit(["id": id, "ok": false, "error": err?.localizedDescription ?? "snapshot failed"]); return }
        do { try png.write(to: URL(fileURLWithPath: path)); emit(["id": id, "ok": true, "value": path]) } catch { emit(["id": id, "ok": false, "error": "\(error)"]) }
      }
    case "quit":
      emit(["id": id, "ok": true, "value": NSNull()])
      exit(0)
    default:
      emit(["id": id, "ok": false, "error": "unknown cmd"])
    }
  }
}

let args = CommandLine.arguments
let app = NSApplication.shared
app.setActivationPolicy(.accessory)          // Dock に出さない・前面に出ない
let driver = Driver(w: CGFloat(Double(args.count > 1 ? args[1] : "1440") ?? 1440), h: CGFloat(Double(args.count > 2 ? args[2] : "900") ?? 900), strictAutoplay: !(args.count > 3 && args[3] == "free"))
Thread.detachNewThread {
  while let line = readLine(strippingNewline: true) {
    guard let d = line.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
    DispatchQueue.main.async { driver.handle(obj) }
  }
  DispatchQueue.main.async { exit(0) }       // 親が終わったら自分も終わる
}
emit(["ev": "ready"])
app.run()
