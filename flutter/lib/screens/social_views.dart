import 'package:flutter/material.dart';

import '../app/controller.dart';
import '../theme.dart';
import 'dialogs.dart' as dlg;

class _TabHead extends StatelessWidget {
  final String title;
  const _TabHead(this.title);
  @override
  Widget build(BuildContext context) =>
      Padding(padding: const EdgeInsets.only(top: 4, bottom: 12), child: Text(title, style: display(26)));
}

class FriendsView extends StatefulWidget {
  final App app;
  const FriendsView({super.key, required this.app});
  @override
  State<FriendsView> createState() => _FriendsViewState();
}

class _FriendsViewState extends State<FriendsView> {
  final _code = TextEditingController();
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final app = widget.app;
    final guest = app.uid == null || app.isGuest;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _TabHead('Friends'),
      Panel(
        child: guest
            ? const EmptyNote('Sign in with Google from Online play to add friends.')
            : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  Expanded(child: Text('Your friends', style: display(18))),
                  Text.rich(TextSpan(style: const TextStyle(color: C.creamDim, fontSize: 12), children: [
                    const TextSpan(text: 'code: '),
                    TextSpan(
                        text: '${app.profile?['friendCode'] ?? '-'}',
                        style: const TextStyle(fontWeight: FontWeight.w800, color: C.brass)),
                  ])),
                ]),
                const SizedBox(height: 10),
                if (app.friends.isEmpty)
                  const EmptyNote('No friends yet. Swap codes to add one.')
                else
                  for (final fuid in app.friends.keys) _friendRow(app, fuid),
                const SizedBox(height: 10),
                Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _code,
                      maxLength: 6,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(hintText: 'Friend code', counterText: ''),
                    ),
                  ),
                  const SizedBox(width: 8),
                  GhostButton('Add', expand: false, onPressed: () async {
                    await app.addFriendByCode(_code.text);
                    if (app.friendError == null) _code.clear();
                  }),
                ]),
                ErrText(app.friendError),
              ]),
      ),
    ]);
  }

  Widget _friendRow(App app, String fuid) {
    final info = app.friendInfo[fuid];
    final name = '${info?['name'] ?? (app.friends[fuid] is Map ? app.friends[fuid]['name'] : null) ?? 'Player'}';
    final online = info?['online'] == true;
    return ListItem(
      title: Row(children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(shape: BoxShape.circle, color: online ? C.jade : const Color(0xFF6B5F52))),
        const SizedBox(width: 8),
        Flexible(child: Text(name, overflow: TextOverflow.ellipsis)),
      ]),
      sub: online ? 'online' : 'offline',
      actions: [
        if (online) GhostButton('challenge', mini: true, expand: false, onPressed: () => app.sendChallenge(fuid)),
        GhostButton('profile', mini: true, expand: false, onPressed: () => dlg.openProfile(app, fuid)),
        GhostButton('remove', mini: true, expand: false, onPressed: () => app.removeFriend(fuid)),
      ],
    );
  }
}

class MessagesView extends StatelessWidget {
  final App app;
  const MessagesView({super.key, required this.app});
  @override
  Widget build(BuildContext context) {
    final ch = app.freshChallenges;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const _TabHead('Messages'),
      Panel(
        child: ch.isEmpty
            ? const EmptyNote('No messages yet. Challenges from friends arrive here.')
            : Column(children: [
                for (final c in ch)
                  ListItem(
                    title: Text('⚔ ${c.value['fromName']} challenged you'),
                    sub: 'a private table is waiting',
                    actions: [
                      PrimaryButton('Play', mini: true, expand: false, onPressed: () => app.acceptChallenge(c.key)),
                      GhostButton('Dismiss', mini: true, expand: false, onPressed: () => app.declineChallenge(c.key)),
                    ],
                  ),
              ]),
      ),
    ]);
  }
}
