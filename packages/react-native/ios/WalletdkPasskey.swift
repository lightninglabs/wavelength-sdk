import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

// The native half of the passkey ceremony: WebAuthn-shaped JSON in, a minimal
// WebAuthn-shaped JSON response out (id, rawId, type, and the PRF extension
// results; that subset is all the TypeScript parser reads). The JSON-to-
// ASAuthorization mapping follows react-native-passkey (MIT,
// https://github.com/f-23/react-native-passkey), which shipped the iOS 18 PRF
// path this implementation mirrors.
//
// Experimental: compiles and is driven by unit-tested TS request shapes, but
// has not been verified end to end; that needs an Associated Domains
// entitlement backed by a paid Apple Developer Program team.
@objc(WalletdkPasskey)
public final class WalletdkPasskey: NSObject {

  // Retains in-flight runners; ASAuthorizationController does not retain its
  // delegate, so each ceremony holds itself here until it completes. Typed
  // as AnyObject because stored properties cannot be availability-gated and
  // PasskeyRunner itself requires iOS 18.
  private var inFlight: [AnyObject] = []

  // PRF requires the iOS 18 AuthenticationServices API.
  @objc public static func prfSupported() -> Bool {
    if #available(iOS 18.0, *) {
      return true
    }
    return false
  }

  @objc public func create(
    _ requestJson: String,
    completion: @escaping (String?, String?) -> Void
  ) {
    guard #available(iOS 18.0, *) else {
      completion(nil, "passkeys require iOS 18 or newer")
      return
    }
    guard
      let body = parseJson(requestJson),
      let rp = body["rp"] as? [String: Any],
      let rpId = rp["id"] as? String,
      let user = body["user"] as? [String: Any],
      let userName = user["name"] as? String,
      let userIdB64 = user["id"] as? String,
      let userId = Self.dataFromBase64Url(userIdB64),
      let challengeB64 = body["challenge"] as? String,
      let challenge = Self.dataFromBase64Url(challengeB64),
      let salt = prfSalt(body)
    else {
      completion(nil, "malformed passkey registration request")
      return
    }

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
      relyingPartyIdentifier: rpId)
    let request = provider.createCredentialRegistrationRequest(
      challenge: challenge, name: userName, userID: userId)
    request.userVerificationPreference = .required
    request.prf = .inputValues(
      ASAuthorizationPublicKeyCredentialPRFRegistrationInput.InputValues(
        saltInput1: salt, saltInput2: nil))

    run(
      request: request,
      cancelMessage: "passkey registration was cancelled",
      completion: completion)
  }

  @objc public func get(
    _ requestJson: String,
    completion: @escaping (String?, String?) -> Void
  ) {
    guard #available(iOS 18.0, *) else {
      completion(nil, "passkeys require iOS 18 or newer")
      return
    }
    guard
      let body = parseJson(requestJson),
      let rpId = body["rpId"] as? String,
      let challengeB64 = body["challenge"] as? String,
      let challenge = Self.dataFromBase64Url(challengeB64),
      let salt = prfSalt(body)
    else {
      completion(nil, "malformed passkey assertion request")
      return
    }

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
      relyingPartyIdentifier: rpId)
    let request = provider.createCredentialAssertionRequest(challenge: challenge)
    request.userVerificationPreference = .required
    if let allowed = body["allowCredentials"] as? [[String: Any]] {
      request.allowedCredentials = allowed.compactMap { entry in
        guard
          let idB64 = entry["id"] as? String,
          let id = Self.dataFromBase64Url(idB64)
        else {
          return nil
        }
        return ASAuthorizationPlatformPublicKeyCredentialDescriptor(
          credentialID: id)
      }
    }
    request.prf = .inputValues(
      ASAuthorizationPublicKeyCredentialPRFRegistrationInput.InputValues(
        saltInput1: salt, saltInput2: nil))

    run(
      request: request,
      cancelMessage: "passkey authentication was cancelled",
      completion: completion)
  }

  @available(iOS 18.0, *)
  private func run(
    request: ASAuthorizationRequest,
    cancelMessage: String,
    completion: @escaping (String?, String?) -> Void
  ) {
    let runner = PasskeyRunner(
      cancelMessage: cancelMessage, completion: completion)
    runner.onDone = { [weak self, weak runner] in
      self?.inFlight.removeAll { $0 === runner }
    }
    inFlight.append(runner)
    runner.run(request: request)
  }

  // prfSalt reads extensions.prf.eval.first (base64url) from a request body.
  private func prfSalt(_ body: [String: Any]) -> Data? {
    guard
      let extensions = body["extensions"] as? [String: Any],
      let prf = extensions["prf"] as? [String: Any],
      let eval = prf["eval"] as? [String: Any],
      let firstB64 = eval["first"] as? String
    else {
      return nil
    }
    return Self.dataFromBase64Url(firstB64)
  }

  private func parseJson(_ json: String) -> [String: Any]? {
    guard let data = json.data(using: .utf8) else {
      return nil
    }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  static func base64Url(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  static func dataFromBase64Url(_ value: String) -> Data? {
    var s = value
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while s.count % 4 != 0 {
      s += "="
    }
    return Data(base64Encoded: s)
  }
}

// PasskeyRunner owns one ceremony: it runs the controller, anchors its UI to
// the key window, and serializes the credential (or error) back to JSON.
@available(iOS 18.0, *)
private final class PasskeyRunner: NSObject,
  ASAuthorizationControllerDelegate,
  ASAuthorizationControllerPresentationContextProviding {

  private let cancelMessage: String
  private let completion: (String?, String?) -> Void
  var onDone: () -> Void = {}

  init(cancelMessage: String, completion: @escaping (String?, String?) -> Void) {
    self.cancelMessage = cancelMessage
    self.completion = completion
  }

  func run(request: ASAuthorizationRequest) {
    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    controller.performRequests()
  }

  func presentationAnchor(
    for controller: ASAuthorizationController
  ) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    switch authorization.credential {
    case let registration
      as ASAuthorizationPlatformPublicKeyCredentialRegistration:
      completion(
        Self.responseJson(
          credentialId: registration.credentialID,
          prfFirst: Self.prfData(registration.prf?.first)),
        nil)
    case let assertion as ASAuthorizationPlatformPublicKeyCredentialAssertion:
      completion(
        Self.responseJson(
          credentialId: assertion.credentialID,
          prfFirst: Self.prfData(assertion.prf?.first)),
        nil)
    default:
      completion(nil, "unexpected credential type from the authenticator")
    }
    onDone()
  }

  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithError error: Error
  ) {
    let asError = error as? ASAuthorizationError
    let message = asError?.code == .canceled
      ? cancelMessage
      : error.localizedDescription
    completion(nil, message)
    onDone()
  }

  // prfData converts a PRF output (a CryptoKit SymmetricKey) into raw bytes.
  private static func prfData(_ key: SymmetricKey?) -> Data? {
    key?.withUnsafeBytes { Data($0) }
  }

  // responseJson builds the minimal WebAuthn response the TS parser reads.
  private static func responseJson(credentialId: Data, prfFirst: Data?) -> String? {
    var extensionResults: [String: Any] = [:]
    if let first = prfFirst {
      extensionResults = [
        "prf": ["results": ["first": WalletdkPasskey.base64Url(first)]],
      ]
    }
    let body: [String: Any] = [
      "id": WalletdkPasskey.base64Url(credentialId),
      "rawId": WalletdkPasskey.base64Url(credentialId),
      "type": "public-key",
      "clientExtensionResults": extensionResults,
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: body) else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }
}
