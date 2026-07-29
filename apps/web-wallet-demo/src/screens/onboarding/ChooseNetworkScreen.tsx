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

// ChooseNetworkScreen serves a legacy registry entry (migrated from the
// single-wallet era, before the network was tracked per wallet): its network
// is unknown until this one-time pick. Regtest carries the same advanced
// endpoints section as WalletSetupScreen, because a real legacy regtest
// wallet needs its local server addresses re-entered; hosted networks reuse
// their SDK preset regardless of what is edited here.
export function ChooseNetworkScreen({
  walletName,
  onSubmit,
  onBack,
  busy,
  error,
}: {
  walletName: string;
  onSubmit: (network: RuntimeNetwork, endpoints: WalletEndpoints) => void;
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  const [network, setNetwork] = useState<RuntimeNetwork>(AVAILABLE_NETWORKS[0]);
  const [endpoints, setEndpoints] = useState<WalletEndpoints>(() =>
    endpointsForNetwork(AVAILABLE_NETWORKS[0]),
  );
  const [advanced, setAdvanced] = useState(false);

  function onNetworkChange(next: RuntimeNetwork) {
    setNetwork(next);
    setEndpoints(endpointsForNetwork(next));
  }

  function setField<K extends keyof WalletEndpoints>(key: K, value: WalletEndpoints[K]) {
    setEndpoints((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    onSubmit(
      network,
      network === "regtest" ? endpoints : endpointsForNetwork(network),
    );
  }

  return (
    <AuthLayout network={network} wide>
      <AuthHeader
        title="Choose network"
        sub={`"${walletName}" was created before wallets tracked their network. Pick the one it was set up on; this is remembered after it unlocks successfully.`}
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
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
          disabled={busy}
        >
          Continue
        </PrimaryButton>
        <InlineError message={error} />
      </form>

      <div className="mt-5 text-center text-sm">
        <TextLink onClick={onBack}>Back to wallets</TextLink>
      </div>
    </AuthLayout>
  );
}
