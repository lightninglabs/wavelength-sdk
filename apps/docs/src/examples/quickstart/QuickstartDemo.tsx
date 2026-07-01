// QuickstartDemo is the snippet the Quickstart page shows AND runs. Its body is
// finalized in Phase B against the RFC API; for now it renders the harness shell
// so the page demonstrates the full code|demo structure.
//
// The harness renders a "Launch live wallet" button; on click it boots the
// signet-backed wallet client through the SDK seam (src/lib/walletdk-client.ts).
import LiveExample from '../../components/LiveExample';

export default function QuickstartDemo() {
  return <LiveExample />;
}
