import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config.dart';
import '../state/app_state.dart';
import '../theme.dart';
import '../widgets.dart';
import 'main_screens.dart';

/// Splash → onboarding (first launch) → app. Login is always optional (guest mode).
class RootGate extends ConsumerStatefulWidget {
  const RootGate({super.key});
  @override
  ConsumerState<RootGate> createState() => _RootGateState();
}

class _RootGateState extends ConsumerState<RootGate> {
  bool _splashDone = false;

  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1400), () => mounted ? setState(() => _splashDone = true) : null);
  }

  @override
  Widget build(BuildContext context) {
    final onboarded = ref.watch(settingsProvider.select((s) => s.onboarded));
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 350),
      child: !_splashDone
          ? const SplashScreen()
          : onboarded
              ? const HomeShell()
              : const OnboardingScreen(),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            LogoMark(size: 120),
            SizedBox(height: 24),
            Text('SAHU MUSIC', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 6)),
            SizedBox(height: 8),
            Text(Brand.tagline, style: TextStyle(color: Brand.gold, fontSize: 15)),
          ]),
        ),
      );
}

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});
  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pages = PageController();
  int _page = 0;

  static const _slides = [
    (Icons.library_music_rounded, 'Har Gaana, Ek Jagah.', 'Discover Hindi, Punjabi, devotional, pop and independent music in one place.'),
    (Icons.verified_rounded, 'Free and legal', 'Every track is streamed from open platforms where artists share their own work. No subscription, ever.'),
    (Icons.headphones_rounded, 'Plays in the background', 'Keep listening with the screen off and control playback from your lock screen.'),
  ];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _finish() => ref.read(settingsProvider.notifier).setOnboarded();

  @override
  Widget build(BuildContext context) {
    final last = _page == _slides.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: _finish, child: const Text('Skip', style: TextStyle(color: Brand.muted)))),
          Expanded(
            child: PageView.builder(
              controller: _pages,
              itemCount: _slides.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (_, i) {
                final (icon, title, text) = _slides[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Container(
                      width: 140,
                      height: 140,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Brand.gold.withValues(alpha: 0.12), border: Border.all(color: Brand.gold.withValues(alpha: 0.4))),
                      child: Icon(icon, size: 64, color: Brand.gold),
                    ),
                    const SizedBox(height: 36),
                    Text(title, textAlign: TextAlign.center, style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 12),
                    Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted, fontSize: 15, height: 1.5)),
                  ]),
                );
              },
            ),
          ),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            for (var i = 0; i < _slides.length; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: i == _page ? 22 : 8,
                height: 8,
                decoration: BoxDecoration(color: i == _page ? Brand.gold : Brand.line, borderRadius: BorderRadius.circular(4)),
              ),
          ]),
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
            child: last
                ? Column(children: [
                    SizedBox(width: double.infinity, child: FilledButton(onPressed: _finish, child: const Text('Continue as guest'))),
                    if (AppConfig.backendConfigured) ...[
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: () async {
                            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AuthScreen()));
                            _finish();
                          },
                          child: const Text('Log in or sign up'),
                        ),
                      ),
                    ],
                  ])
                : SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () => _pages.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut),
                      child: const Text('Next'),
                    ),
                  ),
          ),
        ]),
      ),
    );
  }
}

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});
  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _signup = false, _busy = false;
  String? _error, _notice;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    final auth = ref.read(authProvider.notifier);
    final email = _email.text.trim().toLowerCase();
    if (_signup) {
      final (err, confirm) = await auth.signUp(email, _password.text, _name.text.trim());
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = err;
        if (err == null && confirm) _notice = 'Account created. Check your email to confirm, then log in.';
      });
      if (err == null && !confirm) Navigator.pop(context);
    } else {
      final err = await auth.signIn(email, _password.text);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = err;
      });
      if (err == null) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
          child: Form(
            key: _form,
            child: Column(children: [
              const LogoMark(size: 72),
              const SizedBox(height: 16),
              Text(_signup ? 'Create your account' : 'Welcome back', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
              const SizedBox(height: 4),
              Text(_signup ? 'Free forever. No subscription.' : 'Log in to sync your library.', style: const TextStyle(color: Brand.muted)),
              const SizedBox(height: 24),
              if (_signup) ...[
                TextFormField(
                  controller: _name,
                  maxLength: 50,
                  textInputAction: TextInputAction.next,
                  autofillHints: const [AutofillHints.name],
                  decoration: const InputDecoration(labelText: 'Name', counterText: ''),
                  validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
                ),
                const SizedBox(height: 14),
              ],
              TextFormField(
                controller: _email,
                maxLength: 254,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(labelText: 'Email', counterText: ''),
                validator: (v) => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch((v ?? '').trim()) ? null : 'Enter a valid email address',
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _password,
                maxLength: 72,
                obscureText: true,
                autofillHints: [_signup ? AutofillHints.newPassword : AutofillHints.password],
                decoration: InputDecoration(labelText: 'Password', counterText: '', helperText: _signup ? 'At least 8 characters with a letter and a number' : null),
                onFieldSubmitted: (_) => _submit(),
                validator: (v) {
                  final p = v ?? '';
                  if (!_signup) return p.isEmpty ? 'Enter your password' : null;
                  if (p.length < 8) return 'At least 8 characters';
                  if (!RegExp(r'[A-Za-z]').hasMatch(p) || !RegExp(r'\d').hasMatch(p)) return 'Use a letter and a number';
                  return null;
                },
              ),
              if (_error != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_error!, style: const TextStyle(color: Color(0xFFFCA5A5)))),
              if (_notice != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(_notice!, style: const TextStyle(color: Brand.goldSoft))),
              const SizedBox(height: 20),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Please wait…' : (_signup ? 'Sign up' : 'Log in')))),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => setState(() {
                  _signup = !_signup;
                  _error = null;
                  _notice = null;
                }),
                child: Text(_signup ? 'Already have an account? Log in' : 'New here? Create an account', style: const TextStyle(color: Brand.gold)),
              ),
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Continue as guest', style: TextStyle(color: Colors.white70))),
            ]),
          ),
        ),
      ),
    );
  }
}
