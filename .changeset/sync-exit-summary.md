---
'@lightninglabs/walletdk-core': minor
'@lightninglabs/walletdk-web': minor
'@lightninglabs/walletdk-react-native': minor
---

Add `exitSummary()` to the client: it reports the wallet-wide portfolio of
in-progress unilateral exits (one entry per active exit plus aggregate totals
for the amount being recovered, the estimated fees, and the estimated net
recoverable).

`exitStatus()` gains a `detailed` option that returns recovery-tree progress, a
CSV maturity countdown, a fee breakdown, and a best-case block countdown.
`getExitPlan()` entries now carry an `infeasibilityReason` explaining why an
exit cannot start yet. This pairs the SDK with the latest wallet runtime.
