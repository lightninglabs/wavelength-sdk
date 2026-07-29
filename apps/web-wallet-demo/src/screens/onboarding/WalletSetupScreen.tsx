import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { DEBUG_LEVELS } from "@lightninglabs/wavelength-web";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { InlineError } from "../../components/ui/InlineError";
import { PrimaryButton, TextLink } from "../../components/ui/Button";
import { NetworkPicker } from "../../components/ui/NetworkPicker";
import { ToggleRow } from "../../components/ui/ToggleRow";
import { cn } from "../../lib/cn";
import {
  endpointsForNetwork,
  NETWORKS,
  RuntimeNetwork,
  WalletEndpoints,
} from "../../lib/runtime-config";
import { regtestEnabled } from "../../lib/devGate";

const AVAILABLE_NETWORKS = NETWORKS.filter(
  (n) => n !== "regtest" || regtestEnabled(),
);

// WalletSetupScreen collects everything a fresh registry entry needs: a
// display name, the network, and (only for regtest, where there is no hosted
// preset) the server endpoints. It serves both the create and restore flows;
// the flows differ only in copy here, diverging afterward (restore continues
// into the recovery-phrase step, create into the wallet-type picker). The
// onSwitchMode link flips between the two flows in place, which is also how
// a fresh browser (no wallet list yet) reaches restore at all.
export function WalletSetupScreen({
  mode,
  onSubmit,
  onBack,
  onSwitchMode,
  busy,
  error,
}: {
  mode: "create" | "restore";
  onSubmit: (args: {
    name: string;
    network: RuntimeNetwork;
    endpoints: WalletEndpoints;
  }) => void;
  onBack: (() => void) | null;
  onSwitchMode: (() => void) | null;
  busy: boolean;
  error: string;
}) {
  const [name, setName] = useState("My Wallet");
  const [network, setNetwork] = useState<RuntimeNetwork>(AVAILABLE_NETWORKS[0]);
  const [endpoints, setEndpoints] = useState<WalletEndpoints>(() =>
    endpointsForNetwork(AVAILABLE_NETWORKS[0]),
  );
  const [advanced, setAdvanced] = useState(false);

  // Endpoints are only ever hand-edited for regtest, so switching away from it
  // resets the draft: nothing is lost, since the non-regtest presets are
  // recomputed from endpointsForNetwork at submit time regardless.
  function onNetworkChange(next: RuntimeNetwork) {
    setNetwork(next);
    setEndpoints(endpointsForNetwork(next));
  }

  function setField<K extends keyof WalletEndpoints>(key: K, value: WalletEndpoints[K]) {
    setEndpoints((prev) => ({ ...prev, [key]: value }));
  }

  const trimmedName = name.trim();

  function handleSubmit() {
    onSubmit({
      name: trimmedName,
      network,
      endpoints: network === "regtest" ? endpoints : endpointsForNetwork(network),
    });
  }

  return (
    <AuthLayout network={network} wide>
      <AuthHeader
        title={mode === "create" ? "Create a wallet" : "Restore a wallet"}
        sub="Name it, choose a network, and continue."
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <Field label="Wallet name" value={name} onChange={setName} />

        <div>
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Network
          </span>
          <NetworkPicker
            value={network}
            onChange={onNetworkChange}
            options={AVAILABLE_NETWORKS}
          />
        </div>

        {network === "regtest" ? (
          <div className="border border-border">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <span className="text-sm font-medium text-fg">
                Advanced endpoints
              </span>
              <ChevronDown
                size={16}
                className={cn(
                  "text-muted transition-transform",
                  advanced && "rotate-180",
                )}
              />
            </button>
            {advanced ? (
              <div className="space-y-4 border-t border-border px-4 pb-4 pt-4">
                <Field
                  label="Ark server address"
                  value={endpoints.arkServerAddress}
                  onChange={(v) => setField("arkServerAddress", v)}
                  mono
                />
                <Field
                  label="Wallet Esplora URL"
                  value={endpoints.walletEsploraUrl}
                  onChange={(v) => setField("walletEsploraUrl", v)}
                  mono
                />
                <Field
                  label="Swap server address"
                  value={endpoints.swapServerAddress}
                  onChange={(v) => setField("swapServerAddress", v)}
                  mono
                />
                <Select
                  label="Debug level"
                  value={endpoints.debugLevel}
                  onChange={(v) =>
                    setField("debugLevel", v as WalletEndpoints["debugLevel"])
                  }
                  options={DEBUG_LEVELS}
                />
                <ToggleRow
                  title="Allow insecure transport"
                  subtitle="Permit non-TLS Ark server connections"
                  on={endpoints.arkServerInsecure}
                  onChange={(v) => setField("arkServerInsecure", v)}
                />
                <ToggleRow
                  title="Allow insecure swap transport"
                  subtitle="Permit non-TLS swap server connections"
                  on={endpoints.swapServerInsecure}
                  onChange={(v) => setField("swapServerInsecure", v)}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <PrimaryButton
          type="submit"
          icon={ArrowRight}
          busy={busy}
          disabled={busy || trimmedName.length === 0}
        >
          Continue
        </PrimaryButton>
        <InlineError message={error} />
      </form>

      {onSwitchMode || onBack ? (
        <div className="mt-5 flex items-center justify-center gap-4 text-center text-sm">
          {onSwitchMode ? (
            <TextLink onClick={onSwitchMode}>
              {mode === "create" ? "Restore instead" : "Create instead"}
            </TextLink>
          ) : null}
          {onBack ? <TextLink onClick={onBack}>Back to wallets</TextLink> : null}
        </div>
      ) : null}
    </AuthLayout>
  );
}
