/**
 * Residue editor strip for /packet — edit residue before open.
 * Power of 10: bounded list render, fail-closed empty statement / over-cap.
 */
import { useState } from "react";
import {
  MAX_ID_LEN,
  MAX_RESIDUE_ITEMS,
  addResidueItem,
  listResidueForUi,
  removeResidueItem,
  residueEvidenceOptions,
  setResidueItem,
  type EvidenceClass,
  type IssuePacket,
  type ResidueItem,
} from "@/lib/packet";

const EVIDENCE = residueEvidenceOptions();

function ResidueRow({
  item,
  onSet,
  onRemove,
}: {
  item: ResidueItem;
  onSet: (item: ResidueItem) => string | null;
  onRemove: (id: string) => string | null;
}) {
  const [statement, setStatement] = useState(item.statement);
  const [evidence, setEvidence] = useState<EvidenceClass>(item.evidence);
  const [localError, setLocalError] = useState<string | null>(null);

  function apply() {
    const trimmed = statement.trim();
    if (trimmed.length === 0) {
      setLocalError("statement empty");
      return;
    }
    const err = onSet({
      id: item.id,
      statement: trimmed,
      evidence,
    });
    setLocalError(err);
  }

  function drop() {
    const err = onRemove(item.id);
    setLocalError(err);
  }

  return (
    <li className="rounded-md border border-line bg-raised px-3 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-fg">{item.id}</span>
        <span className="text-xs tracking-wide text-muted uppercase">
          {item.evidence}
        </span>
      </div>
      <label className="mt-3 block text-xs tracking-wide text-muted uppercase">
        Statement
        <textarea
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
        />
      </label>
      <label className="mt-2 block text-xs tracking-wide text-muted uppercase">
        Evidence
        <select
          value={evidence}
          onChange={(event) =>
            setEvidence(event.target.value as EvidenceClass)
          }
          className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
        >
          {EVIDENCE.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => apply()}
          className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
        >
          Apply residue
        </button>
        <button
          type="button"
          onClick={() => drop()}
          className="min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
        >
          Remove
        </button>
      </div>
      {localError ? (
        <p className="mt-2 text-sm text-accent" role="alert">
          fail-closed — {localError}
        </p>
      ) : null}
    </li>
  );
}

function AddResidueForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (item: ResidueItem) => string | null;
}) {
  const [id, setId] = useState("");
  const [statement, setStatement] = useState("");
  const [evidence, setEvidence] = useState<EvidenceClass>("unknown");
  const [localError, setLocalError] = useState<string | null>(null);

  function apply() {
    if (disabled) {
      setLocalError("residue full");
      return;
    }
    const trimmedId = id.trim();
    const trimmedStatement = statement.trim();
    if (trimmedId.length === 0) {
      setLocalError("id invalid");
      return;
    }
    if (trimmedId.length > MAX_ID_LEN) {
      setLocalError("id bounds");
      return;
    }
    if (trimmedStatement.length === 0) {
      setLocalError("statement empty");
      return;
    }
    const err = onAdd({
      id: trimmedId,
      statement: trimmedStatement,
      evidence,
    });
    setLocalError(err);
    if (err === null) {
      setId("");
      setStatement("");
      setEvidence("unknown");
    }
  }

  return (
    <div className="mt-3 rounded-md border border-line bg-raised px-3 py-3 text-sm">
      <h3 className="text-xs tracking-wide text-muted uppercase">Add residue</h3>
      <label className="mt-3 block text-xs tracking-wide text-muted uppercase">
        Id
        <input
          type="text"
          value={id}
          onChange={(event) => setId(event.target.value)}
          maxLength={MAX_ID_LEN}
          disabled={disabled}
          className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
        />
      </label>
      <label className="mt-2 block text-xs tracking-wide text-muted uppercase">
        Statement
        <textarea
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          rows={3}
          disabled={disabled}
          className="mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg"
        />
      </label>
      <label className="mt-2 block text-xs tracking-wide text-muted uppercase">
        Evidence
        <select
          value={evidence}
          onChange={(event) =>
            setEvidence(event.target.value as EvidenceClass)
          }
          disabled={disabled}
          className="mt-1 h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-fg"
        >
          {EVIDENCE.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => apply()}
        disabled={disabled}
        className="mt-3 min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg disabled:opacity-50"
      >
        Add residue item
      </button>
      {localError ? (
        <p className="mt-2 text-sm text-accent" role="alert">
          fail-closed — {localError}
        </p>
      ) : null}
      {disabled ? (
        <p className="mt-2 text-xs text-muted">
          Cap {MAX_RESIDUE_ITEMS} reached — remove an item to add.
        </p>
      ) : null}
    </div>
  );
}

export function ResidueEditorStrip({
  packet,
  onPacket,
}: {
  packet: IssuePacket;
  onPacket: (next: IssuePacket) => void;
}) {
  const rows = listResidueForUi(packet.residue);
  const [stripError, setStripError] = useState<string | null>(null);
  const atCap = packet.residue.length >= MAX_RESIDUE_ITEMS;

  function applySet(item: ResidueItem): string | null {
    console.assert(item.id.length > 0, "set residue id");
    const result = setResidueItem(packet, item);
    if (!result.ok) {
      setStripError(result.reason);
      return result.reason;
    }
    setStripError(null);
    onPacket(result.packet);
    return null;
  }

  function applyAdd(item: ResidueItem): string | null {
    console.assert(item.id.length > 0, "add residue id");
    const result = addResidueItem(packet, item);
    if (!result.ok) {
      setStripError(result.reason);
      return result.reason;
    }
    setStripError(null);
    onPacket(result.packet);
    return null;
  }

  function applyRemove(id: string): string | null {
    console.assert(id.length > 0, "remove residue id");
    const result = removeResidueItem(packet, id);
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
        Residue editor
      </h2>
      <p className="mt-2 text-sm text-muted">
        Edit residue items before open. Statement and evidence required;
        empty statement fail-closes. Cap {MAX_RESIDUE_ITEMS}. Updates feed
        validate / evaluate / open / export.
      </p>
      <p className="mt-2 font-mono text-xs text-muted">
        {rows.length} / {MAX_RESIDUE_ITEMS} items
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No residue items yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <ResidueRow
              key={row.id + "@" + packet.subjectId}
              item={row}
              onSet={applySet}
              onRemove={applyRemove}
            />
          ))}
        </ul>
      )}
      <AddResidueForm disabled={atCap} onAdd={applyAdd} />
      {stripError ? (
        <p className="mt-3 text-sm text-accent" role="alert">
          fail-closed — {stripError}
        </p>
      ) : null}
    </section>
  );
}
