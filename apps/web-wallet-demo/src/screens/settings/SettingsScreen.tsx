import { ReactNode, useState } from "react";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  Layers,
  LogOut,
  type LucideIcon,
  Monitor,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  Wallet,
  Zap,
} from "lucide-react";
import { useWallet, useWalletInfo } from "@lightninglabs/wavelength-react";
import { GatewayFields } from "../../components/GatewayFields";
import { PageHead } from "../../components/layout/PageHead";
import { AppTab } from "../../components/layout/nav";
import { Band } from "../../components/ui/Band";
import { CopyButton } from "../../components/ui/CopyButton";
import { Label } from "../../components/ui/Label";
import { Segmented } from "../../components/ui/Segmented";
import { SummaryRow } from "../../components/ui/SummaryRow";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { cn } from "../../lib/cn";
import { formatSats, shortKey } from "../../lib/format";
import { statusLabel } from "../../lib/phase";
import { WalletEntry } from "../../lib/walletRegistry";
import { useTheme } from "../../theme/ThemeProvider";

// TwoCol pairs two compact sections within one band, split by a hairline column
// rule, so the band fills its width instead of stranding a control on the side.
function TwoCol({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid gap-y-8 sm:grid-cols-2 sm:gap-y-0">
      <div className="sm:pr-10">{left}</div>
      <div className="sm:border-l sm:border-border sm:pl-10">{right}</div>
    </div>
  );
}

// createdLabel renders a wallet entry's creation timestamp as a short date.
function createdLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// SettingsScreen surfaces this wallet's identity, runtime status, appearance,
// wallet-type security, advanced gateway configuration, build version and
// the wallet-management actions (switch, delete), consolidated into
// full-bleed Zones bands.
export function SettingsScreen({
  entry,
  onSwitchWallet,
  onDeleteWallet,
  onNavigate,
}: {
  entry: WalletEntry;
  onSwitchWallet: () => void;
  onDeleteWallet: () => void;
  onNavigate: (tab: AppTab) => void;
}) {
  const { phase } = useWallet();
  const info = useWalletInfo();
  const phaseLabel = statusLabel(phase);
  const { theme, setTheme } = useTheme();
  const [advanced, setAdvanced] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const identity = info?.identityPubKey || "";

  // A row's `tone` colors its stat icon with the accent matching the stat's
  // domain (sky network, teal wallet identity, orange chain height), mirroring
  // the Overview runtime strip; `good` rows read fully in lime instead.
  const runtime: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    good?: boolean;
    tone?: string;
  }> = [
    { icon: ShieldCheck, label: "Phase", value: phaseLabel, good: true },
    { icon: Zap, label: "Network", value: info?.network || "-", tone: "text-sky" },
    {
      icon: Wallet,
      label: "Wallet",
      value: info?.walletType || "-",
      tone: "text-teal",
    },
    {
      icon: Server,
      label: "Server",
      value: info?.serverConnected ? "Connected" : "Offline",
      good: info?.serverConnected,
    },
    {
      icon: Layers,
      label: "Block height",
      value: info?.blockHeight ? formatSats(info.blockHeight) : "-",
      tone: "text-orange",
    },
  ];

  return (
    <div>
      <PageHead
        title="Settings"
        subtitle="Identity, appearance, security and runtime"
        onBack={() => onNavigate("home")}
      />

      <Band>
        <Label accent="violet" rule>This wallet</Label>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center
                border border-border bg-well text-muted"
            >
              <Wallet size={17} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg">{entry.name}</span>
                <span
                  className="border border-border px-1.5 py-0.5 text-[10px]
                    uppercase tracking-wide text-muted"
                >
                  {entry.network ?? "unknown"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted">
                Created {createdLabel(entry.createdAt)}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onSwitchWallet}
            className="inline-flex items-center justify-center gap-2 border
              border-border bg-surface-alt px-4 py-2.5 text-sm font-semibold
              text-fg transition-colors hover:border-border-strong"
          >
            <ArrowLeftRight size={16} /> Switch wallet
          </button>
        </div>
      </Band>

      <Band tinted>
        <Label accent="teal" rule>Runtime</Label>
        <div className="mt-4 flex flex-wrap divide-border sm:divide-x">
          {runtime.map((r) => (
            <div key={r.label} className="flex-1 px-0 sm:px-5 sm:first:pl-0">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <r.icon
                  size={13}
                  className={r.good ? "text-lime" : (r.tone ?? "text-muted")}
                />
                {r.label}
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-sm tabular-nums",
                  r.good ? "text-lime" : "text-fg",
                )}
              >
                {r.value}
              </div>
            </div>
          ))}
        </div>
      </Band>

      <Band>
        <TwoCol
          left={
            <>
              <Label accent="teal" rule>Identity</Label>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="break-all font-mono text-sm text-fg">
                  {identity ? shortKey(identity, 10, 8) : "-"}
                </span>
                {identity ? <CopyButton value={identity} /> : null}
              </div>
            </>
          }
          right={
            <>
              <Label rule>About</Label>
              <div className="mt-3 space-y-2.5 text-sm">
                <SummaryRow label="Version" value={info?.version || "-"} mono />
                <SummaryRow label="Commit" value={info?.commit || "-"} mono />
              </div>
            </>
          }
        />
      </Band>

      <Band tinted>
        <TwoCol
          left={
            <>
              <Label accent="lime" rule>Security</Label>
              <div className="mt-3 space-y-2.5 text-sm">
                <SummaryRow
                  label="Wallet type"
                  value={
                    entry.walletKind === "passkey"
                      ? "Passkey"
                      : entry.walletKind === "password"
                        ? "Password"
                        : "Unknown"
                  }
                />
              </div>
            </>
          }
          right={
            <>
              <Label accent="sky" rule>Appearance</Label>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <Monitor size={16} className="text-muted" />
                  <div className="text-sm font-medium text-fg">Theme</div>
                </div>
                <Segmented
                  size="sm"
                  value={theme}
                  onChange={(t) => setTheme(t)}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </div>
            </>
          }
        />
      </Band>

      <Band>
        <TwoCol
          left={
            <>
              <Label rule>Advanced</Label>
              <button
                type="button"
                onClick={() => setAdvanced((v) => !v)}
                className="mt-3 flex w-full items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <SettingsIcon size={15} className="text-muted" />
                  <span className="text-sm font-medium text-fg">
                    Network servers
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    "text-muted transition-transform",
                    advanced && "rotate-180",
                  )}
                />
              </button>
            </>
          }
          right={
            <>
              <Label rule>Danger zone</Label>
              <button
                type="button"
                aria-label="Emergency exit"
                onClick={() => onNavigate("exit")}
                className="mt-3 flex w-full items-center gap-3 border
                  border-border bg-surface-alt px-4 py-2.5 text-left
                  transition-colors hover:border-border-strong"
              >
                <LogOut size={16} className="shrink-0 text-muted" />
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-fg">
                    Emergency exit
                  </span>
                  <span className="block text-xs text-muted">
                    Recover your funds on-chain
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>
              <div className="mt-3 flex flex-row items-start gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center justify-center gap-2 border
                    border-bad bg-bad/10 px-4 py-2.5 text-sm font-semibold
                    text-bad transition-opacity hover:opacity-90"
                >
                  <Trash2 size={16} /> Delete this wallet
                </button>
              </div>
            </>
          }
        />
        {advanced ? (
          <div className="mt-6 border-t border-border pt-6">
            <p className="mb-4 text-xs text-muted">
              Display only. This is the configuration the wallet was created
              with; it cannot be changed after the fact.
            </p>
            <GatewayFields endpoints={entry.endpoints} dataDir={entry.dataDir} />
          </div>
        ) : null}
      </Band>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this wallet?"
        description="This removes the wallet from your list only. Its data stays in this browser's storage until you use Clear all data on the wallet list to reclaim it."
        confirmLabel="Delete wallet"
        destructive
        onConfirm={onDeleteWallet}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
