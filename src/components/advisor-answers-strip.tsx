/**
 * Advisor answers strip for /packet — fill advisorChecks before open.
 * Power of 10: bounded checklist render, fail-closed empty apply.
 */
import { useState } from "react";
import {
  allowedAnswerRoles,
  findAdvisorAnswer,
  listAdvisorChecksForUi,
  setAdvisorAnswer,
  type AdvisorAnswer,
  type AdvisorCheck,
  type AuthorityRole,
  type DomainPack,
  type EvidenceClass,
  type IssuePacket,
} from "@/lib/packet";

const ANSWER_EVIDENCE: readonly EvidenceClass[] = [
  "measured",
  "derived",
  "aspirational",
  "ledger",
  "unknown",
] as const;

function defaultRoleForCheck(check: AdvisorCheck): AuthorityRole {
  const allowed = allowedAnswerRoles(check);
  let i = 0;
  while (i < allowed.length) {
    if (allowed[i] === check.answerAuthority) return allowed[i];
    i += 1;
  }
  return allowed.length > 0 ? allowed[allowed.length - 1] : "human_open";
}

function AdvisorAnswerRow({
  check,
  existing,
  onApply,
}: {
  check: AdvisorCheck;
  existing: AdvisorAnswer | null;
  onApply: (answer: AdvisorAnswer) => string | null;
}) {
  const allowed = allowedAnswerRoles(check);
  const [text, setText] = useState(existing?.answer ?? "");
  const [role, setRole] = useState<AuthorityRole>(
    existing?.answeredAs ?? defaultRoleForCheck(check),
  );
  const [evidence, setEvidence] = useState<EvidenceClass>(
    existing?.evidence ?? "unknown",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  function apply() {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setLocalError("answer empty");
      return;
    }
    const err = onApply({
      checkId: check.id,
      answer: trimmed,
      evidence,
      answeredAs: role,
    });
    setLocalError(err);
  }

  return (
    <li className="rounded-md border border-line bg-raised px-3 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-fg">{check.id}</span>
        <span className="text-xs tracking-wide text-muted uppercase">
          {check.layer} · auth {check.answerAuthority}
        </span>
      </div>
      <p className="mt-2 text-muted">{check.prompt}</p>
      {existing ? (
        <p className="mt-2 font-mono text-xs text-accent">
          answeredAs {existing.answeredAs} · {existing.evidence}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">No answer yet.</p>
      )}
      <label className="mt-3 block text-xs tracking-wide text-muted uppercase">
        Answer
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
        />
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs tracking-wide text-muted uppercase">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AuthorityRole)}
            className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
          >
            {allowed.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs tracking-wide text-muted uppercase">
          Evidence
          <select
            value={evidence}
            onChange={(event) =>
              setEvidence(event.target.value as EvidenceClass)
            }
            className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
          >
            {ANSWER_EVIDENCE.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={() => apply()}
        className="mt-3 min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
      >
        Apply answer
      </button>
      {localError ? (
        <p className="mt-2 text-sm text-accent" role="alert">
          fail-closed — {localError}
        </p>
      ) : null}
    </li>
  );
}

export function AdvisorAnswersStrip({
  pack,
  packet,
  onPacket,
}: {
  pack: DomainPack;
  packet: IssuePacket;
  onPacket: (next: IssuePacket) => void;
}) {
  const checks = listAdvisorChecksForUi(pack.advisorChecks);
  const [stripError, setStripError] = useState<string | null>(null);

  function applyOne(answer: AdvisorAnswer): string | null {
    console.assert(answer.checkId.length > 0, "apply checkId");
    let check: AdvisorCheck | null = null;
    let i = 0;
    while (i < checks.length) {
      if (checks[i].id === answer.checkId) {
        check = checks[i];
        break;
      }
      i += 1;
    }
    if (check === null) {
      setStripError("unknown checkId");
      return "unknown checkId";
    }
    const result = setAdvisorAnswer(packet, answer, check);
    if (!result.ok) {
      setStripError(result.reason);
      return result.reason;
    }
    setStripError(null);
    onPacket(result.packet);
    return null;
  }

  return (
    <section className="mb-4 rounded-md border border-line bg-surface p-4">
      <h2 className="text-xs tracking-widest text-accent uppercase">
        Advisor answers
      </h2>
      <p className="mt-2 text-sm text-muted">
        Fill pack advisorChecks before open. Roles constrained per check
        (evaluator / human_open; agent_propose only on non-OPEN checks). Empty
        answer fail-closes. Updates feed validate / evaluate / open / export.
      </p>
      {checks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No advisor checks on this pack.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {checks.map((check) => (
            <AdvisorAnswerRow
              key={check.id + "@" + packet.subjectId}
              check={check}
              existing={findAdvisorAnswer(packet.advisorAnswers, check.id)}
              onApply={applyOne}
            />
          ))}
        </ul>
      )}
      {stripError ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {stripError}
        </p>
      ) : null}
    </section>
  );
}
