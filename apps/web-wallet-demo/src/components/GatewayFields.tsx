import { DEBUG_LEVELS } from "@lightninglabs/wavelength-web";
import { Field } from "./ui/Field";
import { Select } from "./ui/Select";
import { ToggleRow } from "./ui/ToggleRow";
import { RuntimeFieldSetter, RuntimeForm } from "../lib/runtime-config";

// GatewayFields renders the runtime gateway endpoints and security toggles
// bound to a RuntimeForm. `disabled` makes them display-only, used by the
// Settings advanced section, where the running config cannot be edited.
export function GatewayFields({
  form,
  onField,
  disabled = false,
}: {
  form: RuntimeForm;
  onField: RuntimeFieldSetter;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Ark server address"
        value={form.arkServerAddress}
        onChange={(v) => onField("arkServerAddress", v)}
        mono
        disabled={disabled}
      />
      <Field
        label="Wallet Esplora URL"
        value={form.walletEsploraUrl}
        onChange={(v) => onField("walletEsploraUrl", v)}
        mono
        disabled={disabled}
      />
      <Field
        label="Swap server address"
        value={form.swapServerAddress}
        onChange={(v) => onField("swapServerAddress", v)}
        mono
        disabled={disabled}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Data directory"
          value={form.dataDir}
          onChange={(v) => onField("dataDir", v)}
          mono
          disabled={disabled}
        />
        <Field
          label="Swap database file"
          value={form.swapDatabaseFileName}
          onChange={(v) => onField("swapDatabaseFileName", v)}
          mono
          disabled={disabled}
        />
      </div>
      <Select
        label="Debug level"
        value={form.debugLevel}
        onChange={(v) => onField("debugLevel", v as RuntimeForm["debugLevel"])}
        options={DEBUG_LEVELS}
        disabled={disabled}
      />
      <ToggleRow
        title="Allow insecure transport"
        subtitle="Permit non-TLS Ark server connections"
        on={form.arkServerInsecure}
        onChange={(v) => onField("arkServerInsecure", v)}
        disabled={disabled}
      />
      <ToggleRow
        title="Allow insecure swap transport"
        subtitle="Permit non-TLS swap server connections"
        on={form.swapServerInsecure}
        onChange={(v) => onField("swapServerInsecure", v)}
        disabled={disabled}
      />
      <ToggleRow
        title="Disable swaps"
        subtitle="Run without the submarine-swap server"
        on={form.disableSwaps}
        onChange={(v) => onField("disableSwaps", v)}
        disabled={disabled}
      />
    </div>
  );
}
