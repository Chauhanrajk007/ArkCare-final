export default function SimulationBadge({ children = "SIMULATED", real = false }) {
  return (
    <span className={"cq-pixel-label " + (real ? "cq-real-label" : "cq-sim-label")}>
      {children}
    </span>
  );
}
