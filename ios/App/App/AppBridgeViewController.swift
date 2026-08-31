import Capacitor
import UIKit

class AppBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BuiltinMediaPlugin())
    }
}
