import Capacitor

class WorkoutBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WorkoutLocationPlugin())
    }
}
