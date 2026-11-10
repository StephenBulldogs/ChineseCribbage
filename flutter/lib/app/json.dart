// Helpers for Firebase Realtime Database values. RTDB hands back
// Map<Object?, Object?>, and turns objects with dense integer keys
// ({"0":..,"1":..}) into Lists — these normalise both shapes.

/// Any snapshot value as a String-keyed map. Lists become index-keyed maps
/// (null holes skipped), matching how JS iterates the same data.
Map<String, dynamic> asMap(Object? v) {
  if (v is Map) {
    return {for (final e in v.entries) '${e.key}': _deep(e.value)};
  }
  if (v is List) {
    final out = <String, dynamic>{};
    for (var i = 0; i < v.length; i++) {
      if (v[i] != null) out['$i'] = _deep(v[i]);
    }
    return out;
  }
  return {};
}

dynamic _deep(Object? v) {
  if (v is Map) return asMap(v);
  if (v is List) return v.map(_deep).toList();
  return v;
}

/// A snapshot value deep-converted to plain Dart maps/lists.
dynamic plain(Object? v) => _deep(v);

/// Move logs: arrays (or array-like maps) of row indexes.
List<int> normMoves(Object? m) {
  if (m is List) return [for (final x in m) if (x != null) toInt(x)];
  if (m is Map) {
    final keys = m.keys.map((k) => int.tryParse('$k') ?? 0).toList()..sort();
    return [for (final k in keys) toInt(m['$k'] ?? m[k])];
  }
  return [];
}

int toInt(Object? v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

int? toIntOrNull(Object? v) => v == null ? null : toInt(v);

bool isTrue(Object? v) => v == true;
