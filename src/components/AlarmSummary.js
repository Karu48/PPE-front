import React from "react";
import { Badge } from "react-bootstrap";

const REQUIRED_KEYS = ["FACE", "HEAD", "LEFT_HAND", "RIGHT_HAND"];

const AlarmSummary = ({ testResults }) => {
  const getWindowAdjustedMissingCount = (person) => {
    if (person && person.ppeCompliance) {
      return REQUIRED_KEYS.reduce((acc, key) => {
        const entry = person.ppeCompliance[key];
        const presentInWindow = entry && entry.present === true;
        return acc + (presentInWindow ? 0 : 1);
      }, 0);
    }
    // Fallback to frame-level missing list
    return person && person.missingPPE ? person.missingPPE.length : 0;
  };

  const adjustedMissingCounts = testResults.map((p) => getWindowAdjustedMissingCount(p));
  const totalMissingPPE = adjustedMissingCounts.reduce((a, b) => a + b, 0);
  const peopleWithAlarms = adjustedMissingCounts.filter((c) => c > 0).length;

  // Don't show anything if everyone has proper PPE in the window
  if (peopleWithAlarms === 0) {
    return null;
  }

  return (
    <div className="compliance-status danger">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
        <span style={{ fontSize: "1.2em", marginRight: "8px" }}>🚨</span>
        <strong>ALARMA DE CUMPLIMIENTO EPP</strong>
      </div>
      <div>
        <strong>Resumen:</strong>
        <ul style={{ marginTop: "8px", marginBottom: "0", textAlign: "left" }}>
          <li>
            <Badge variant="danger" style={{ marginRight: "8px" }}>
              {peopleWithAlarms}
            </Badge>
            persona(s) con EPP faltante (según ventana)
          </li>
          <li>
            <Badge variant="danger" style={{ marginRight: "8px" }}>
              {totalMissingPPE}
            </Badge>
            elemento(s) de EPP faltantes en total (según ventana)
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AlarmSummary;