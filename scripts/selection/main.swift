import AppKit
import ApplicationServices
import Foundation

struct Selection: Encodable {
    let status: String
    var text: String? = nil
}

// No key events, clipboard access, app activation, or permission prompts.
func readSelection() -> Selection {
    guard CommandLine.arguments.count == 2, AXIsProcessTrusted() else {
        return Selection(status: "unavailable")
    }
    let path = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
    let candidates = NSWorkspace.shared.runningApplications.filter {
        $0.bundleURL?.standardizedFileURL == path && !$0.isTerminated
    }
    // Do not guess between multiple instances or read Raycast's own search field.
    guard candidates.count == 1, let app = candidates.first,
          !(app.bundleIdentifier ?? "").hasPrefix("com.raycast.") else {
        return Selection(status: "unavailable")
    }
    let application = AXUIElementCreateApplication(app.processIdentifier)
    AXUIElementSetMessagingTimeout(application, 0.2)
    var focused: CFTypeRef?
    guard AXUIElementCopyAttributeValue(application, kAXFocusedUIElementAttribute as CFString, &focused) == .success,
          let focused = focused, CFGetTypeID(focused) == AXUIElementGetTypeID() else {
        return Selection(status: "unavailable")
    }
    let element = focused as! AXUIElement
    AXUIElementSetMessagingTimeout(element, 0.2)
    var selected: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selected)
    if result == .noValue { return Selection(status: "empty") }
    guard result == .success, let text = selected as? String else {
        return Selection(status: "unavailable")
    }
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? Selection(status: "empty") : Selection(status: "selected", text: trimmed)
}

do {
    FileHandle.standardOutput.write(try JSONEncoder().encode(readSelection()))
} catch {
    fputs("Could not encode selection result.\n", stderr)
    exit(1)
}
