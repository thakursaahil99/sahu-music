import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

/// The signed-in account.
class AppUser {
  const AppUser({required this.id, required this.email, this.displayName});
  final String id;
  final String email;
  final String? displayName;
}

class BackendException implements Exception {
  BackendException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// Client for the SAHU MUSIC backend (the website's /api/v1, data in Neon).
/// The app signs in with `client: "mobile"` and keeps the returned session token on the
/// device; every request sends it as a Bearer token. No database credentials are in the app.
class Backend {
  Backend(this._prefs, {http.Client? client}) : _http = client ?? http.Client();

  final SharedPreferences _prefs;
  final http.Client _http;
  static const _tokenKey = 'session.token';

  bool get configured => AppConfig.backendConfigured;
  String? get token => _prefs.getString(_tokenKey);
  bool get hasSession => (token ?? '').isNotEmpty;

  Uri _uri(String path) => Uri.parse('${AppConfig.apiBaseUrl}/api/v1/$path/');

  Future<Map<String, dynamic>> call(String method, String path, [Map<String, dynamic>? body]) async {
    if (!configured) throw BackendException(503, 'Accounts are not configured in this build.');
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (hasSession) 'Authorization': 'Bearer $token',
    };
    http.Response res;
    try {
      res = method == 'GET'
          ? await _http.get(_uri(path), headers: headers).timeout(const Duration(seconds: 20))
          : await _http.post(_uri(path), headers: headers, body: jsonEncode(body ?? const {})).timeout(const Duration(seconds: 20));
    } catch (_) {
      throw BackendException(0, 'No connection. Check your internet and try again.');
    }
    Map<String, dynamic>? data;
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map<String, dynamic>) data = decoded;
    } catch (_) {}
    if (res.statusCode == 401 && hasSession) await _prefs.remove(_tokenKey); // session ended elsewhere
    if (res.statusCode >= 400 || data == null) {
      throw BackendException(res.statusCode, (data?['error'] as String?) ?? 'Request failed (HTTP ${res.statusCode}).');
    }
    return data;
  }

  AppUser? _userFrom(Map<String, dynamic> data) {
    final u = data['user'];
    if (u is! Map) return null;
    final p = data['profile'];
    return AppUser(id: '${u['id']}', email: '${u['email']}', displayName: p is Map ? p['display_name'] as String? : null);
  }

  Future<AppUser?> me() async {
    if (!hasSession) return null;
    return _userFrom(await call('GET', 'auth/me'));
  }

  Future<AppUser?> signIn(String email, String password) => _start('auth/login', {'email': email, 'password': password});

  Future<AppUser?> signUp(String email, String password, String name) =>
      _start('auth/signup', {'email': email, 'password': password, 'displayName': name});

  Future<AppUser?> _start(String path, Map<String, dynamic> body) async {
    final data = await call('POST', path, {...body, 'client': 'mobile'});
    final t = data['token'];
    if (t is! String || t.isEmpty) throw BackendException(500, 'Sign-in failed.');
    await _prefs.setString(_tokenKey, t);
    return _userFrom(data);
  }

  Future<void> signOut() async {
    if (hasSession) {
      try {
        await call('POST', 'auth/logout', {});
      } catch (_) {}
    }
    await _prefs.remove(_tokenKey);
  }

  /// Fire-and-forget write for library changes.
  void send(String path, Map<String, dynamic> body) {
    if (!hasSession) return;
    call('POST', path, body).then((_) {}, onError: (_) {});
  }
}
