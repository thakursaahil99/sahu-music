import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sahu_music/services/backend.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late List<http.Request> sent;

  MockClient server() => MockClient((req) async {
        sent.add(req);
        final path = req.url.path;
        if (path.endsWith('/auth/login/')) {
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          if (body['password'] != 'right-password') return http.Response(jsonEncode({'error': 'Wrong email or password.'}), 401);
          expect(body['client'], 'mobile');
          return http.Response(
            jsonEncode({
              'user': {'id': 'u1', 'email': body['email']},
              'profile': {'display_name': 'Tester'},
              'token': 'token-abcdefghijklmnopqrstuvwxyz',
            }),
            200,
          );
        }
        if (path.endsWith('/auth/me/')) {
          if (req.headers['authorization'] != 'Bearer token-abcdefghijklmnopqrstuvwxyz') return http.Response(jsonEncode({'user': null}), 200);
          return http.Response(jsonEncode({'user': {'id': 'u1', 'email': 'a@b.co'}, 'profile': {'display_name': 'Tester'}}), 200);
        }
        if (path.endsWith('/library/')) return http.Response(jsonEncode({'error': 'Please sign in.'}), 401);
        return http.Response(jsonEncode({'ok': true}), 200);
      });

  setUp(() {
    sent = [];
    SharedPreferences.setMockInitialValues({});
  });

  test('sign in keeps the session token and sends it as a Bearer token', () async {
    final b = Backend(await SharedPreferences.getInstance(), client: server());
    final user = await b.signIn('a@b.co', 'right-password');
    expect(user?.id, 'u1');
    expect(user?.displayName, 'Tester');
    expect(b.hasSession, isTrue);

    final me = await b.me();
    expect(me?.email, 'a@b.co');
    expect(sent.last.headers['authorization'], 'Bearer token-abcdefghijklmnopqrstuvwxyz');
    expect(sent.last.url.toString(), endsWith('/api/v1/auth/me/'));
  });

  test('a wrong password gives the server message and stores nothing', () async {
    final b = Backend(await SharedPreferences.getInstance(), client: server());
    expect(() => b.signIn('a@b.co', 'nope'), throwsA(isA<BackendException>().having((e) => e.message, 'message', 'Wrong email or password.')));
    expect(b.hasSession, isFalse);
  });

  test('a 401 (session ended elsewhere) forgets the token', () async {
    final b = Backend(await SharedPreferences.getInstance(), client: server());
    await b.signIn('a@b.co', 'right-password');
    await expectLater(b.call('GET', 'library'), throwsA(isA<BackendException>()));
    expect(b.hasSession, isFalse);
  });

  test('sign out ends the session on the server and on the device', () async {
    final b = Backend(await SharedPreferences.getInstance(), client: server());
    await b.signIn('a@b.co', 'right-password');
    await b.signOut();
    expect(sent.last.url.path, endsWith('/auth/logout/'));
    expect(b.hasSession, isFalse);
  });
}
