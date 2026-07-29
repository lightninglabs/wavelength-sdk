import { SummaryRow } from "./ui/SummaryRow";
import { WalletEndpoints } from "../lib/runtime-config";

// GatewayFields is a read-only display of a wallet's endpoint configuration,
// used by the Settings advanced section. Endpoints are fixed at wallet
// creation and never edited afterward, so this is always display-only. A
// legacy entry whose network was chosen this session but not yet persisted
// has no endpoints yet; every value falls back to a placeholder rather than
// crashing on the missing fields.
export function GatewayFields({
  endpoints,
  dataDir,
}: {
  endpoints: WalletEndpoints | null;
  dataDir: string;
}) {
  const value = (v: string | undefined) => (v ? v : "Not set");

  return (
    <div className="space-y-2.5 text-sm">
      <SummaryRow
        label="Ark server address"
        value={value(endpoints?.arkServerAddress)}
        mono
      />
      <SummaryRow
        label="Wallet Esplora URL"
        value={value(endpoints?.walletEsploraUrl)}
        mono
      />
      <SummaryRow
        label="Swap server address"
        value={value(endpoints?.swapServerAddress)}
        mono
      />
      <SummaryRow label="Data directory" value={value(dataDir)} mono />
      <SummaryRow label="Debug level" value={value(endpoints?.debugLevel)} mono />
      <SummaryRow
        label="Allow insecure transport"
        value={endpoints ? (endpoints.arkServerInsecure ? "Yes" : "No") : "Not set"}
      />
      <SummaryRow
        label="Allow insecure swap transport"
        value={endpoints ? (endpoints.swapServerInsecure ? "Yes" : "No") : "Not set"}
      />
    </div>
  );
}
