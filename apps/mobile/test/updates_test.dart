import 'package:flutter_test/flutter_test.dart';
import 'package:sahu_music/services/updates.dart';

void main() {
  const site = {
    'android': {'version': '1.0.2', 'build': 3, 'url': 'https://sahu-music.vercel.app/download/', 'notes': 'Faster search'},
  };

  test('a newer build on the website is offered', () {
    final u = parseUpdate(site, 2);
    expect(u?.version, '1.0.2');
    expect(u?.url, 'https://sahu-music.vercel.app/download/');
    expect(u?.notes, 'Faster search');
  });

  test('the same or an older build is not offered', () {
    expect(parseUpdate(site, 3), isNull);
    expect(parseUpdate(site, 9), isNull);
  });

  test('broken or unsafe data is ignored', () {
    expect(parseUpdate({}, 1), isNull);
    expect(parseUpdate({'android': 'x'}, 1), isNull);
    expect(parseUpdate({'android': {'build': 5, 'url': 'http://insecure.example/app.apk'}}, 1), isNull);
    expect(parseUpdate({'android': {'build': '7', 'url': 'https://a.example/'}}, 1)?.build, 7);
  });
}
