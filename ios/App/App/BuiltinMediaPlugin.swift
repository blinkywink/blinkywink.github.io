import Capacitor
import Foundation

@objc(BuiltinMediaPlugin)
public class BuiltinMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BuiltinMediaPlugin"
    public let jsName = "BuiltinMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getMediaBase", returnType: CAPPluginReturnPromise),
    ]

    @objc func getMediaBase(_ call: CAPPluginCall) {
        guard let root = Bundle.main.url(forResource: "public", withExtension: nil) else {
            call.reject("IPA is missing the bundled public folder")
            return
        }
        call.resolve(["base": root.path])
    }
}
