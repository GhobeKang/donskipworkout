import Capacitor
import CoreLocation
import Foundation
import UIKit
import UserNotifications

final class WorkoutLocationManager: NSObject, CLLocationManagerDelegate {
    static let shared = WorkoutLocationManager()
    private let manager = CLLocationManager()
    private let defaults = UserDefaults.standard
    private let region_id = "workout_place"
    private let notification_id = "workout_arrival"
    private var position_completion: ((Result<CLLocation, Error>) -> Void)?
    private var position_request_id = UUID()

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        registerNotificationAction()
        restoreMonitoring()
    }

    var has_precise: Bool {
        let authorized = manager.authorizationStatus == .authorizedAlways
            || manager.authorizationStatus == .authorizedWhenInUse
        return authorized && manager.accuracyAuthorization == .fullAccuracy
    }

    var has_background: Bool { manager.authorizationStatus == .authorizedAlways }

    var has_place: Bool { defaults.object(forKey: "workout_place_latitude") != nil }

    var place_name: String { defaults.string(forKey: "workout_place_name") ?? "" }

    func requestForeground() {
        if manager.authorizationStatus != .notDetermined && !has_precise {
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        } else {
            manager.requestWhenInUseAuthorization()
        }
    }

    func requestBackground() {
        if manager.authorizationStatus == .authorizedWhenInUse
            && !defaults.bool(forKey: "workout_location_requested_always") {
            defaults.set(true, forKey: "workout_location_requested_always")
            manager.requestAlwaysAuthorization()
        } else if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    func currentPosition(completion: @escaping (Result<CLLocation, Error>) -> Void) {
        guard has_precise else {
            completion(.failure(NSError(domain: "WorkoutLocation", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "정확한 위치 권한을 먼저 허용해 주세요."])))
            return
        }
        guard position_completion == nil else {
            completion(.failure(NSError(domain: "WorkoutLocation", code: 3,
                userInfo: [NSLocalizedDescriptionKey: "위치 확인이 이미 진행 중입니다."])))
            return
        }
        let request_id = UUID()
        position_request_id = request_id
        position_completion = completion
        manager.requestLocation()
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self, self.position_request_id == request_id,
                  let pending_completion = self.position_completion else { return }
            self.position_completion = nil
            pending_completion(.failure(NSError(domain: "WorkoutLocation", code: 4,
                userInfo: [NSLocalizedDescriptionKey: "위치 확인 시간이 초과되었습니다."])))
        }
    }

    func savePlace(user_uuid: String, name: String, latitude: Double, longitude: Double, language: String) {
        clearPlace()
        defaults.set(user_uuid, forKey: "workout_place_user_uuid")
        defaults.set(name, forKey: "workout_place_name")
        defaults.set(language, forKey: "workout_place_language")
        defaults.set(latitude, forKey: "workout_place_latitude")
        defaults.set(longitude, forKey: "workout_place_longitude")
        registerNotificationAction()
        restoreMonitoring()
    }

    func clearPlace() {
        for region in manager.monitoredRegions where region.identifier == region_id {
            manager.stopMonitoring(for: region)
        }
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [notification_id])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [notification_id])
        for key in ["workout_place_user_uuid", "workout_place_name", "workout_place_latitude",
                    "workout_place_longitude", "workout_place_language", "workout_place_inside", "workout_place_request_id",
                    "workout_place_notified_at", "workout_place_monitoring_error",
                    "workout_active_timer", "workout_pending_exit"] {
            defaults.removeObject(forKey: key)
        }
    }

    func restoreMonitoring() {
        guard has_place, has_precise, has_background, CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else { return }
        let coordinate = CLLocationCoordinate2D(
            latitude: defaults.double(forKey: "workout_place_latitude"),
            longitude: defaults.double(forKey: "workout_place_longitude"))
        let region = CLCircularRegion(center: coordinate, radius: 150, identifier: region_id)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        manager.startMonitoring(for: region)
        manager.requestState(for: region)
    }

    func isValidStart(request_id: String) -> Bool {
        guard defaults.bool(forKey: "workout_place_inside"),
              defaults.string(forKey: "workout_place_request_id") == request_id else { return false }
        let notified_at = defaults.double(forKey: "workout_place_notified_at")
        return Date().timeIntervalSince1970 - notified_at <= 30 * 60
    }

    private func registerNotificationAction() {
        let action_title = defaults.string(forKey: "workout_place_language") == "en" ? "Start workout" : "운동 시작"
        let action = UNNotificationAction(identifier: "start_workout", title: action_title, options: [.foreground])
        let category = UNNotificationCategory(identifier: "workout_arrival_action",
                                               actions: [action], intentIdentifiers: [], options: [])
        UNUserNotificationCenter.current().getNotificationCategories { categories in
            var updated = Set(categories.filter { $0.identifier != category.identifier })
            updated.insert(category)
            UNUserNotificationCenter.current().setNotificationCategories(updated)
        }
    }

    private func arrive() {
        guard has_place, !defaults.bool(forKey: "workout_place_inside") else { return }
        let request_id = UUID().uuidString.lowercased()
        defaults.set(true, forKey: "workout_place_inside")
        defaults.set(request_id, forKey: "workout_place_request_id")
        defaults.set(Date().timeIntervalSince1970 + 120, forKey: "workout_place_notified_at")
        let english = defaults.string(forKey: "workout_place_language") == "en"
        let content = UNMutableNotificationContent()
        content.title = english ? "Arrived at " + place_name : place_name + "에 도착했어요"
        content.body = english ? "Start your workout timer?" : "운동 타이머를 시작할까요?"
        content.sound = .default
        content.categoryIdentifier = "workout_arrival_action"
        content.userInfo = ["cap_extra": ["source": "workout_location", "request_id": request_id]]
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 120, repeats: false)
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: notification_id, content: content, trigger: trigger))
    }

    private func leave() {
        recordExit()
        defaults.set(false, forKey: "workout_place_inside")
        defaults.removeObject(forKey: "workout_place_request_id")
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [notification_id])
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [notification_id])
    }

    func setActiveTimer(user_uuid: String, timer_uuid: String, expected_revision: Int, server_clock_offset: Double) {
        guard has_place, defaults.string(forKey: "workout_place_user_uuid") == user_uuid else { return }
        if timer_uuid.isEmpty || expected_revision < 1 {
            defaults.removeObject(forKey: "workout_active_timer")
        } else if defaults.dictionary(forKey: "workout_pending_exit") == nil {
            let active_timer: [String: Any] = ["timer_uuid": timer_uuid,
                "expected_revision": expected_revision, "server_clock_offset": server_clock_offset]
            defaults.set(active_timer, forKey: "workout_active_timer")
        }
    }

    func pendingExit() -> [String: Any] {
        return defaults.dictionary(forKey: "workout_pending_exit") ?? [:]
    }

    @discardableResult func recordExit() -> [String: Any] {
        if !pendingExit().isEmpty { return pendingExit() }
        guard has_place, var exit = defaults.dictionary(forKey: "workout_active_timer") else { return [:] }
        exit["request_id"] = UUID().uuidString.lowercased()
        exit["exited_at"] = Date().timeIntervalSince1970 * 1000
        defaults.set(exit, forKey: "workout_pending_exit")
        defaults.removeObject(forKey: "workout_active_timer")
        return exit
    }

    func acknowledgeExit(request_id: String) {
        if pendingExit()["request_id"] as? String == request_id {
            defaults.removeObject(forKey: "workout_pending_exit")
        }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        if region.identifier == region_id { arrive() }
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        if region.identifier == region_id { leave() }
    }

    func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
        guard region.identifier == region_id else { return }
        if state == .inside { arrive() }
        else if state == .outside { leave() }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { restoreMonitoring() }

    func locationManager(_ manager: CLLocationManager, didStartMonitoringFor region: CLRegion) {
        if region.identifier == region_id { defaults.set(false, forKey: "workout_place_monitoring_error") }
    }

    func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
        if region?.identifier == region_id {
            defaults.set(true, forKey: "workout_place_monitoring_error")
            NSLog("[WorkoutLocation] Region monitoring failed: %@", error.localizedDescription)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let completion = position_completion else { return }
        position_completion = nil
        guard let location = locations.last, location.horizontalAccuracy >= 0,
              location.horizontalAccuracy <= 150, abs(location.timestamp.timeIntervalSinceNow) <= 30 else {
            completion(.failure(NSError(domain: "WorkoutLocation", code: 2,
                userInfo: [NSLocalizedDescriptionKey: "현재 위치를 정확히 확인하지 못했습니다. 잠시 후 다시 시도해 주세요."])))
            return
        }
        completion(.success(location))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        position_completion?(.failure(error))
        position_completion = nil
    }
}

@objc(WorkoutLocationPlugin)
public class WorkoutLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutLocationPlugin"
    public let jsName = "WorkoutLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestForegroundPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBackgroundSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savePlace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearPlace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "validateStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveTimer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "peekPendingExit", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recordExit", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledgePendingExit", returnType: CAPPluginReturnPromise)
    ]

    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let location = WorkoutLocationManager.shared
            let owner = UserDefaults.standard.string(forKey: "workout_place_user_uuid") ?? ""
            if !owner.isEmpty && owner != (call.getString("user_uuid") ?? "") { location.clearPlace() }
            var saved_status: [String: Any] = ["precise": location.has_precise, "background": location.has_background,
                          "registered": location.has_place && location.has_precise && location.has_background
                              && !UserDefaults.standard.bool(forKey: "workout_place_monitoring_error"),
                          "name": location.place_name]
            if location.has_place && UserDefaults.standard.object(forKey: "workout_place_longitude") != nil {
                saved_status["latitude"] = UserDefaults.standard.double(forKey: "workout_place_latitude")
                saved_status["longitude"] = UserDefaults.standard.double(forKey: "workout_place_longitude")
            }
            call.resolve(saved_status)
        }
    }

    @objc func requestForegroundPermission(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.requestForeground()
            call.resolve()
        }
    }

    @objc func openBackgroundSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.requestBackground()
            call.resolve()
        }
    }

    @objc func getCurrentPosition(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.currentPosition { result in
                switch result {
                case .success(let position):
                    call.resolve(["latitude": position.coordinate.latitude, "longitude": position.coordinate.longitude,
                                  "accuracy": position.horizontalAccuracy])
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func savePlace(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let user_uuid = call.getString("user_uuid") ?? ""
            let name = (call.getString("name") ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !user_uuid.isEmpty, !name.isEmpty, name.count <= 40,
                  let latitude = call.getDouble("latitude"), let longitude = call.getDouble("longitude"),
                  latitude.isFinite, longitude.isFinite, abs(latitude) <= 90, abs(longitude) <= 180 else {
                call.reject("운동 장소 정보를 확인해 주세요.")
                return
            }
            let location = WorkoutLocationManager.shared
            guard location.has_precise && location.has_background else {
                call.reject("정확한 위치와 항상 허용 권한이 필요합니다.")
                return
            }
            location.savePlace(user_uuid: user_uuid, name: name, latitude: latitude, longitude: longitude,
                               language: call.getString("language") ?? "ko")
            call.resolve()
        }
    }

    @objc func clearPlace(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.clearPlace()
            call.resolve()
        }
    }

    @objc func validateStart(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let valid = WorkoutLocationManager.shared.isValidStart(request_id: call.getString("request_id") ?? "")
            call.resolve(["valid": valid])
        }
    }

    @objc func setActiveTimer(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.setActiveTimer(
                user_uuid: call.getString("user_uuid") ?? "", timer_uuid: call.getString("timer_uuid") ?? "",
                expected_revision: call.getInt("expected_revision") ?? 0,
                server_clock_offset: call.getDouble("server_clock_offset") ?? 0)
            call.resolve()
        }
    }

    @objc func peekPendingExit(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(WorkoutLocationManager.shared.pendingExit()) }
    }

    @objc func recordExit(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(WorkoutLocationManager.shared.recordExit()) }
    }

    @objc func acknowledgePendingExit(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            WorkoutLocationManager.shared.acknowledgeExit(request_id: call.getString("request_id") ?? "")
            call.resolve()
        }
    }

}
