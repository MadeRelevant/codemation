"use client";

import type { CredentialFieldSchema } from "@codemation/core/browser";
import type { Dispatch, SetStateAction } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CredentialDialogFieldRowEntry, type CredentialDialogOrderedField } from "./CredentialDialogFieldRowEntry";

export type { CredentialDialogOrderedField };

export type CredentialDialogFieldRowsProps = Readonly<{
  orderedFields: readonly CredentialDialogOrderedField[];
  publicFieldValues: Record<string, string>;
  setPublicFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  secretFieldValues: Record<string, string>;
  setSecretFieldValues: Dispatch<SetStateAction<Record<string, string>>>;
  envRefValues: Record<string, string>;
  setEnvRefValues: Dispatch<SetStateAction<Record<string, string>>>;
  isEdit: boolean;
  isDbSecretSource: boolean;
  showSecrets: boolean;
  credentialFieldEnvStatus: Readonly<Record<string, boolean>>;
  advancedSection?: Readonly<{
    /** Collapsible section title (default: "Advanced"). */
    title?: string;
    description?: string;
    defaultOpen?: boolean;
  }>;
}>;

function fieldOrder(field: CredentialFieldSchema): number {
  return typeof field.order === "number" && Number.isFinite(field.order) ? field.order : 0;
}

function compareOrderedFields(a: CredentialDialogOrderedField, b: CredentialDialogOrderedField): number {
  const ao = fieldOrder(a.field);
  const bo = fieldOrder(b.field);
  if (ao !== bo) {
    return ao - bo;
  }
  return a.field.key.localeCompare(b.field.key);
}

export function CredentialDialogFieldRows(props: CredentialDialogFieldRowsProps) {
  const {
    orderedFields,
    publicFieldValues,
    setPublicFieldValues,
    secretFieldValues,
    setSecretFieldValues,
    envRefValues,
    setEnvRefValues,
    isEdit,
    isDbSecretSource,
    showSecrets,
    credentialFieldEnvStatus,
    advancedSection,
  } = props;

  const advancedKeys = new Set<string>();
  for (const entry of orderedFields) {
    if (entry.field.visibility === "advanced") {
      advancedKeys.add(entry.field.key);
    }
  }

  const primaryEntries: CredentialDialogOrderedField[] = [];
  const advancedEntries: CredentialDialogOrderedField[] = [];
  for (const entry of orderedFields) {
    if (advancedKeys.has(entry.field.key)) {
      advancedEntries.push(entry);
    } else {
      primaryEntries.push(entry);
    }
  }

  primaryEntries.sort(compareOrderedFields);
  advancedEntries.sort(compareOrderedFields);

  const entryProps = {
    publicFieldValues,
    setPublicFieldValues,
    secretFieldValues,
    setSecretFieldValues,
    envRefValues,
    setEnvRefValues,
    isEdit,
    isDbSecretSource,
    showSecrets,
    credentialFieldEnvStatus,
  };

  const renderEntries = (entries: readonly CredentialDialogOrderedField[]) =>
    entries.map((entry) => (
      <CredentialDialogFieldRowEntry key={`${entry.kind}-${entry.field.key}`} entry={entry} {...entryProps} />
    ));

  if (advancedEntries.length === 0) {
    const flat = [...orderedFields].sort(compareOrderedFields);
    return <div className="flex flex-col gap-4">{renderEntries(flat)}</div>;
  }

  const sectionTitle = advancedSection?.title ?? "Advanced";
  const sectionDefaultOpen = advancedSection?.defaultOpen ?? false;
  const sectionDescription = advancedSection?.description;

  return (
    <div className="flex flex-col gap-4">
      {renderEntries(primaryEntries)}
      <Collapsible defaultOpen={sectionDefaultOpen}>
        <CollapsibleTrigger
          data-testid="credential-advanced-section-trigger"
          className={cn(
            "group flex w-full items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-left text-sm font-medium",
            "hover:bg-muted/50",
          )}
        >
          <span>{sectionTitle}</span>
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent data-testid="credential-advanced-section" className="space-y-4 pt-3">
          {sectionDescription ? <p className="text-xs text-muted-foreground">{sectionDescription}</p> : null}
          {renderEntries(advancedEntries)}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
