/* CreateSkillFromConventionsModal — the accepted rules, shown as the Skill
   they would become.

   Opening the modal ASKS the server to build that skill, and the preview
   endpoint stores nothing: walking away has to leave no row behind, which is
   why the modal never pre-creates anything and never "cleans up" on cancel —
   there is nothing to clean up. The only thing that persists is Create.

   Everything the preview returned is editable first. It is a draft a model
   wrote from rules a person accepted card by card; the person who has to live
   with the skill gets the last word on its name, its description, its type,
   whether it starts enabled, and every line of its body.

   Submit discipline is CreateSkillModal's, for the reason its comment gives:
   `mutate` with callbacks rather than an awaited `mutateAsync` whose rejection
   nobody catches, and close only on success so a failed create keeps the
   user's typing on screen. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ErrorState,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  Textarea,
  TextInput,
  Toggle,
} from "@devdigest/ui";
import type { ConventionSkillPreview, Skill, SkillType } from "@devdigest/shared";
import {
  useConventionSkillPreview,
  useCreateConventionSkill,
  type ConventionSkillDraft,
} from "@/lib/hooks/conventions";
import { formatTokenEstimate } from "@/lib/estimate-tokens";
import { useToast } from "@/lib/toast";
import { BODY_ROWS, MODAL_WIDTH, SKELETON_COUNT, SKELETON_HEIGHT, TYPE_VALUES } from "./constants";
import { fileBaseName, isDraftReady, toDraft, trimDraft } from "./helpers";
import { s } from "./styles";

export function CreateSkillFromConventionsModal({
  repoId,
  onClose,
  onCreated,
}: {
  repoId: string;
  onClose: () => void;
  onCreated?: (skills: Skill[]) => void;
}) {
  const t = useTranslations("conventions");
  // The type vocabulary belongs to the Skills namespace — it names a property
  // of a skill, not of a convention. Copying the four words into
  // `conventions.json` would be two catalogs to keep saying the same thing.
  const tSkills = useTranslations("skills");
  const toast = useToast();

  const preview = useConventionSkillPreview();
  const create = useCreateConventionSkill();

  const [split, setSplit] = React.useState(false);
  const [previews, setPreviews] = React.useState<ConventionSkillPreview[]>([]);
  const [drafts, setDrafts] = React.useState<ConventionSkillDraft[]>([]);
  const [index, setIndex] = React.useState(0);

  const { mutate: buildPreview } = preview;

  /**
   * Ask the server what the accepted rules would become.
   *
   * A mutation rather than a query because it is a POST that stores nothing —
   * there is no cache key it could honestly live under. The drafts are
   * REPLACED on every result, edits included: the N category skills are not
   * the merged one under a different name, so there is no edit to carry
   * across.
   */
  const runPreview = React.useCallback(
    (nextSplit: boolean) =>
      buildPreview(
        { repoId, split: nextSplit },
        {
          onSuccess: (list) => {
            setPreviews(list);
            setDrafts(list.map(toDraft));
            setIndex(0);
          },
        },
      ),
    [buildPreview, repoId],
  );

  // Open and "flip Split" are the same code path, which is the point: `mutate`
  // is stable across renders, so this fires once per `split` value rather than
  // once per keystroke in the body.
  React.useEffect(() => {
    runPreview(split);
  }, [runPreview, split]);

  const total = drafts.length;
  const current = drafts[index];
  const currentPreview = previews[index];

  const patch = (over: Partial<ConventionSkillDraft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...over } : d)));

  // `isIdle` counts as loading: the effect fires after the first commit, so
  // without it the first frame renders "nothing accepted" before the request
  // has even left.
  const loading = preview.isPending || preview.isIdle;

  // EVERY draft has to be complete, not just the one on screen: Create makes
  // all of them, and a name cleared two steps back would otherwise be created
  // nameless by a button that looked perfectly happy.
  const ready = total > 0 && drafts.every(isDraftReady);

  const submit = () =>
    create.mutate(
      {
        repoId,
        // Each draft carries its own `candidate_ids`, straight from the
        // preview it was built from — a claim, not the authority: the server
        // re-derives the accepted set and refuses any id that is not accepted.
        skills: drafts.map(trimDraft),
      },
      {
        onSuccess: (skills) => {
          // The toast bridge carries a string, not a node, so the pointer to
          // the Skills Lab is in the copy rather than in an anchor.
          toast.success(
            t("createSkill.created", { count: skills.length, name: skills[0]?.name ?? "" }),
          );
          onClose();
          onCreated?.(skills);
        },
      },
    );

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkill.title")}
      subtitle={t("createSkill.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {/* Cancel discards the drafts and nothing else — there is no row to
              roll back, because the preview never wrote one. */}
          <Button kind="ghost" onClick={onClose}>
            {t("createSkill.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!ready || create.isPending}
          >
            {create.isPending
              ? t("createSkill.creating")
              : total > 1
                ? t("createSkill.createMany", { count: total })
                : t("createSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {preview.isError ? (
          <ErrorState body={t("createSkill.previewError")} onRetry={() => runPreview(split)} />
        ) : loading ? (
          <div style={s.loadingStack} aria-label={t("createSkill.previewLoading")}>
            {Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <Skeleton key={i} height={SKELETON_HEIGHT} />
            ))}
          </div>
        ) : !current ? (
          // Distinct from loading on purpose: an empty preview means the
          // accepted set emptied out from under this modal.
          <div style={s.empty}>{t("createSkill.previewEmpty")}</div>
        ) : (
          <>
            <div style={s.banner}>
              <Icon.Sparkles size={14} style={s.bannerIcon} />
              <span>
                {t("createSkill.mergedFrom", {
                  rules: currentPreview?.candidate_ids.length ?? 0,
                  files: currentPreview?.evidence_files.length ?? 0,
                })}
              </span>
            </div>

            <FormField
              label={t("createSkill.split")}
              hint={t("createSkill.splitHint")}
              right={<Toggle on={split} onChange={setSplit} size={16} />}
            />

            {/* Only worth a control when splitting actually produced more than
                one skill — a repo whose rules all sit in one category gets the
                same single form it had before the toggle. */}
            {total > 1 && (
              <div style={s.stepper}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="ChevronLeft"
                  aria-label={t("createSkill.prev")}
                  disabled={index === 0}
                  onClick={() => setIndex((i) => i - 1)}
                />
                <span className="tnum" style={s.step}>
                  {t("createSkill.step", { index: index + 1, total })}
                </span>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="ChevronRight"
                  aria-label={t("createSkill.next")}
                  disabled={index === total - 1}
                  onClick={() => setIndex((i) => i + 1)}
                />
                <span style={s.stepHint}>{t("createSkill.stepHint")}</span>
              </div>
            )}

            <FormField label={t("createSkill.fields.name")} required>
              <TextInput value={current.name} onChange={(v) => patch({ name: v })} mono />
            </FormField>

            <FormField
              label={t("createSkill.fields.description")}
              hint={t("createSkill.fields.descriptionHint")}
            >
              <TextInput
                value={current.description}
                onChange={(v) => patch({ description: v })}
              />
            </FormField>

            <FormField label={t("createSkill.fields.type")}>
              <SelectInput
                value={current.type}
                onChange={(v) => patch({ type: v as SkillType })}
                options={TYPE_VALUES.map((v) => ({
                  value: v,
                  label: tSkills(`listItem.type.${v}`),
                }))}
              />
            </FormField>

            <FormField
              label={t("createSkill.fields.enabled")}
              hint={t("createSkill.fields.enabledHint")}
              right={
                <Toggle on={current.enabled} onChange={(v) => patch({ enabled: v })} size={16} />
              }
            />

            <FormField
              label={t("createSkill.fields.body")}
              hint={t("createSkill.fields.bodyHint")}
              required
            >
              <div>
                <div style={s.bodyBar}>
                  <span className="mono" style={s.fileChip}>
                    <Icon.FileText size={13} style={s.fileIcon} />
                    {t("createSkill.fileChip", { name: fileBaseName(current.name) })}
                  </span>
                  {/* An ESTIMATE — there is no tokenizer in the browser, so it
                      is derived from the character count and wears a `~`. */}
                  <span
                    className="tnum"
                    style={s.tokens}
                    title={t("createSkill.tokensTitle")}
                  >
                    {t("createSkill.tokens", { tokens: formatTokenEstimate(current.body) })}
                  </span>
                </div>
                <div style={s.bodyWrap}>
                  <Textarea
                    value={current.body}
                    onChange={(v) => patch({ body: v })}
                    rows={BODY_ROWS}
                    mono
                  />
                </div>
              </div>
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
