export const BLACKLIST_RULE_TYPES = new Set(["id", "idpart", "keyword", "watch", "allow-id"]);

export const makeEmptyBlacklistData = () => ({ rules: [], history: [], nextSeq: 1 });

export function normalizeBlacklistData(raw, migratedAt = new Date().toISOString()) {
  if (!raw || typeof raw !== "object") {
    return { ...makeEmptyBlacklistData(), migrated: false };
  }

  const rules = Array.isArray(raw.rules)
    ? raw.rules
        .filter((rule) => BLACKLIST_RULE_TYPES.has(rule?.type) && String(rule.value || "").trim())
        .map((rule) => ({ ...rule, value: String(rule.value).trim() }))
    : [];
  const rawHistory = Array.isArray(raw.history) ? raw.history : [];
  const history = rawHistory
    .filter((event) => Number.isFinite(Number(event?.seq)) && !event?.undone)
    .map((event) => ({ ...event, seq: Number(event.seq) }));
  const maxStoredSeq = rawHistory.reduce(
    (max, event) => Math.max(max, Number(event?.seq) || 0),
    0
  );
  let nextSeq = Math.max(Number(raw.nextSeq) || 1, maxStoredSeq + 1);
  let migrated = false;
  const linkedHistory = new Set();

  for (const rule of rules) {
    const matchesRule = (event) =>
      event.type === rule.type &&
      String(event.value || "").toLowerCase() === rule.value.toLowerCase();
    const assignedSeq = Number(rule.addedBySeq);
    const assigned = history.find(
      (event) => Number(event.seq) === assignedSeq && matchesRule(event)
    );
    const orphan = assigned || history.find(
      (event) => !linkedHistory.has(Number(event.seq)) && matchesRule(event)
    );

    if (orphan) {
      rule.addedBySeq = Number(orphan.seq);
      linkedHistory.add(Number(orphan.seq));
      continue;
    }

    const seq = nextSeq++;
    rule.addedBySeq = seq;
    history.push({
      seq,
      date: migratedAt,
      type: rule.type,
      value: rule.value,
      note: rule.note || "既有名單",
      undone: false,
    });
    linkedHistory.add(seq);
    migrated = true;
  }

  nextSeq = Math.max(
    nextSeq,
    ...history.map((event) => Number(event.seq) + 1),
    1
  );
  history.sort((a, b) => Number(a.seq) - Number(b.seq));

  return { rules, history, nextSeq, migrated };
}
