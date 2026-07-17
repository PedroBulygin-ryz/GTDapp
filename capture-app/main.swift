import AppKit
import Carbon

private let inboxURL = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Documents/Bubbles/inbox.txt")
private let bubblesURL = FileManager.default.homeDirectoryForCurrentUser
  .appendingPathComponent("Documents/Bubbles/index.html")

@main
final class AppDelegate: NSObject, NSApplicationDelegate {
  private var statusItem: NSStatusItem?
  private var hotKeyRef: EventHotKeyRef?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    setupStatusItem()
    registerHotKey()
  }

  func applicationWillTerminate(_ notification: Notification) {
    if let hotKeyRef {
      UnregisterEventHotKey(hotKeyRef)
    }
  }

  private func setupStatusItem() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    item.button?.title = "B"
    item.button?.toolTip = "Bubbles Capture"

    let menu = NSMenu()
    menu.addItem(NSMenuItem(title: "Capturar ahora", action: #selector(captureNow), keyEquivalent: ""))
    menu.addItem(NSMenuItem(title: "Abrir Bubbles", action: #selector(openBubbles), keyEquivalent: ""))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Salir", action: #selector(quit), keyEquivalent: "q"))
    item.menu = menu

    statusItem = item
  }

  private func registerHotKey() {
    let hotKeyID = EventHotKeyID(signature: fourCharCode("BUBL"), id: 1)
    let modifiers = UInt32(controlKey) | UInt32(optionKey)
    let keyCode = UInt32(kVK_ANSI_B)

    let status = RegisterEventHotKey(
      keyCode,
      modifiers,
      hotKeyID,
      GetApplicationEventTarget(),
      0,
      &hotKeyRef
    )

    guard status == noErr else {
      showMessage("No pude registrar Control + Option + B. Puede estar usado por otra app.")
      return
    }

    var eventSpec = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed)
    )

    InstallEventHandler(
      GetApplicationEventTarget(),
      { _, event, userData in
        guard let userData else { return noErr }
        let app = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
        var hotKeyID = EventHotKeyID()
        GetEventParameter(
          event,
          EventParamName(kEventParamDirectObject),
          EventParamType(typeEventHotKeyID),
          nil,
          MemoryLayout<EventHotKeyID>.size,
          nil,
          &hotKeyID
        )
        if hotKeyID.id == 1 {
          DispatchQueue.main.async {
            app.showCaptureDialog()
          }
        }
        return noErr
      },
      1,
      &eventSpec,
      Unmanaged.passUnretained(self).toOpaque(),
      nil
    )
  }

  @objc private func captureNow() {
    showCaptureDialog()
  }

  @objc private func openBubbles() {
    NSWorkspace.shared.open(bubblesURL)
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }

  private func showCaptureDialog() {
    NSApp.activate(ignoringOtherApps: true)

    let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 420, height: 24))
    input.placeholderString = "Nueva captura para Recopilar"

    let alert = NSAlert()
    alert.messageText = "Capturar en Bubbles"
    alert.informativeText = "Escribi una tarea, idea o seguimiento. Enter guarda."
    alert.accessoryView = input
    alert.addButton(withTitle: "Guardar")
    alert.addButton(withTitle: "Cancelar")
    alert.window.level = .floating

    DispatchQueue.main.async {
      input.becomeFirstResponder()
      alert.window.makeFirstResponder(input)
    }

    let response = alert.runModal()
    let text = input.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard response == .alertFirstButtonReturn, !text.isEmpty else { return }

    do {
      try appendCapture(text)
    } catch {
      showMessage("No pude guardar en inbox.txt.")
    }
  }

  private func showMessage(_ message: String) {
    NSApp.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.messageText = "Bubbles Capture"
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    alert.window.level = .floating
    alert.runModal()
  }
}

private func appendCapture(_ text: String) throws {
  let directory = inboxURL.deletingLastPathComponent()
  try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  if !FileManager.default.fileExists(atPath: inboxURL.path) {
    FileManager.default.createFile(atPath: inboxURL.path, contents: nil)
  }

  let formatter = DateFormatter()
  formatter.dateFormat = "yyyy-MM-dd HH:mm"
  let line = "\(formatter.string(from: Date())) | \(text)\n"
  let data = Data(line.utf8)

  let handle = try FileHandle(forWritingTo: inboxURL)
  defer { try? handle.close() }
  try handle.seekToEnd()
  try handle.write(contentsOf: data)
}

private func fourCharCode(_ string: String) -> OSType {
  var result: OSType = 0
  for scalar in string.unicodeScalars.prefix(4) {
    result = (result << 8) + OSType(scalar.value)
  }
  return result
}
