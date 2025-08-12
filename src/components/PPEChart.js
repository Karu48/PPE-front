import React from "react";
import { Card, Table } from "react-bootstrap";

const PPEChart = ({ 
  analysisResults, 
  currentTime,
  detectionMethod = "any", // 'any' | 'percentage'
  windowSizeSeconds = 3,
  percentageThreshold = 50,
}) => {
  // Compute aggregated results for the current configurable window
  const getCurrentWindowResults = () => {
    const ws = Math.max(0.5, Number(windowSizeSeconds) || 3);
    const windowStart = Math.floor(currentTime / ws) * ws;
    const windowEnd = windowStart + ws;

    const windowResults = analysisResults.filter(
      (result) => result.timestamp >= windowStart && result.timestamp < windowEnd
    );

    if (windowResults.length === 0) return { Persons: [] };

    // Collect per-person counts across frames in the window
    const personAppearances = new Map(); // personId -> frames appeared
    const ppeCounts = new Map(); // personId -> { ppeType -> count frames with that PPE }

    const hasPPEInFrame = (person, ppeType) => {
      const findPart = (name) => person.BodyParts && person.BodyParts.find((bp) => bp.Name === name);
      if (ppeType === "LEFT_GLOVE") {
        const left = findPart("LEFT_HAND");
        return (
          !!left &&
          Array.isArray(left.EquipmentDetections) &&
          left.EquipmentDetections.some((eq) => eq.Type === "GLOVE" || eq.Type === "HAND_COVER")
        );
      }
      if (ppeType === "RIGHT_GLOVE") {
        const right = findPart("RIGHT_HAND");
        return (
          !!right &&
          Array.isArray(right.EquipmentDetections) &&
          right.EquipmentDetections.some((eq) => eq.Type === "GLOVE" || eq.Type === "HAND_COVER")
        );
      }
      if (ppeType === "MASK") {
        const face = findPart("FACE");
        return (
          !!face &&
          Array.isArray(face.EquipmentDetections) &&
          face.EquipmentDetections.some((eq) => eq.Type === "MASK" || eq.Type === "FACE_COVER")
        );
      }
      if (ppeType === "HELMET") {
        const head = findPart("HEAD");
        return (
          !!head &&
          Array.isArray(head.EquipmentDetections) &&
          head.EquipmentDetections.some((eq) => eq.Type === "HELMET" || eq.Type === "HEAD_COVER")
        );
      }
      return false;
    };

    const ppeTypes = ["MASK", "HELMET", "LEFT_GLOVE", "RIGHT_GLOVE"];

    windowResults.forEach((result) => {
      result.result.Persons.forEach((person) => {
        const pid = person.Id;
        personAppearances.set(pid, (personAppearances.get(pid) || 0) + 1);
        const counts = ppeCounts.get(pid) || { MASK: 0, HELMET: 0, LEFT_GLOVE: 0, RIGHT_GLOVE: 0 };
        ppeTypes.forEach((t) => {
          if (hasPPEInFrame(person, t)) counts[t] += 1;
        });
        ppeCounts.set(pid, counts);
      });
    });

    // Build aggregated person list with PPE presence according to method/threshold
    const aggregatedPersons = Array.from(personAppearances.entries()).map(([pid, appearances]) => {
      const counts = ppeCounts.get(pid) || { MASK: 0, HELMET: 0, LEFT_GLOVE: 0, RIGHT_GLOVE: 0 };
      const presence = {};
      ppeTypes.forEach((t) => {
        const percent = (counts[t] / appearances) * 100;
        presence[t] = detectionMethod === "any" ? counts[t] > 0 : percent >= (Number(percentageThreshold) || 0);
      });

      // Convert presence booleans back to a BodyParts structure compatible with the table rendering
      const bodyParts = [];
      if (presence.MASK) {
        bodyParts.push({ Name: "FACE", EquipmentDetections: [{ Type: "MASK", Confidence: 100 }] });
      }
      if (presence.HELMET) {
        bodyParts.push({ Name: "HEAD", EquipmentDetections: [{ Type: "HELMET", Confidence: 100 }] });
      }
      if (presence.LEFT_GLOVE) {
        bodyParts.push({ Name: "LEFT_HAND", EquipmentDetections: [{ Type: "GLOVE", Confidence: 100 }] });
      }
      if (presence.RIGHT_GLOVE) {
        bodyParts.push({ Name: "RIGHT_HAND", EquipmentDetections: [{ Type: "GLOVE", Confidence: 100 }] });
      }

      return { Id: pid, BodyParts: bodyParts };
    });

    return { Persons: aggregatedPersons, windowStart, windowEnd };
  };

  // Get all unique PPE types from current frame only
  const getAllPPETypes = () => ["MASK", "HELMET", "LEFT_GLOVE", "RIGHT_GLOVE"];

  // Get Spanish title for PPE type
  const getSpanishTitle = (ppeType) => {
    const titles = {
      "MASK": "Mascarilla",
      "HELMET": "Casco",
      "LEFT_GLOVE": "Guante Izquierdo",
      "RIGHT_GLOVE": "Guante Derecho"
    };
    return titles[ppeType] || ppeType;
  };

  // Check if a person has a specific PPE type (simplified, uses aggregated BodyParts)
  const hasPPE = (person, ppeType) => {
    if (ppeType === "LEFT_GLOVE") {
      const leftHand = person.BodyParts.find((bp) => bp.Name === "LEFT_HAND");
      return !!(leftHand && leftHand.EquipmentDetections && leftHand.EquipmentDetections.some((eq) => eq.Type === "GLOVE" || eq.Type === "HAND_COVER"));
    } else if (ppeType === "RIGHT_GLOVE") {
      const rightHand = person.BodyParts.find((bp) => bp.Name === "RIGHT_HAND");
      return !!(rightHand && rightHand.EquipmentDetections && rightHand.EquipmentDetections.some((eq) => eq.Type === "GLOVE" || eq.Type === "HAND_COVER"));
    } else if (ppeType === "MASK") {
      const face = person.BodyParts.find((bp) => bp.Name === "FACE");
      return !!(face && face.EquipmentDetections && face.EquipmentDetections.some((eq) => eq.Type === "MASK" || eq.Type === "FACE_COVER"));
    } else if (ppeType === "HELMET") {
      const head = person.BodyParts.find((bp) => bp.Name === "HEAD");
      return !!(head && head.EquipmentDetections && head.EquipmentDetections.some((eq) => eq.Type === "HELMET" || eq.Type === "HEAD_COVER"));
    }
    return false;
  };

  // Get person identifier - always use consistent numbering
  const getPersonId = (person, index) => {
    return `Persona ${index}`;
  };

  const currentResults = getCurrentWindowResults();
  const allPPETypes = getAllPPETypes();

  // Window info (for header display)
  const ws = Math.max(0.5, Number(windowSizeSeconds) || 3);
  const windowStart = Math.floor(currentTime / ws) * ws;

  // Only show chart if there are people detected
  if (currentResults.Persons.length === 0) {
    return (
      <Card>
        <Card.Header>
          <strong>Estado EPP</strong>
        </Card.Header>
        <Card.Body>
          <p className="text-muted">
            No hay personas detectadas en este momento
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <strong>Estado EPP</strong>
        <span style={{ marginLeft: "10px", fontSize: "0.9em", color: "#6c757d" }}>
          {currentResults.Persons.length} personas detectadas
        </span>
        <br />
        <small style={{ color: "#6c757d" }}>
          Ventana de {ws}s: {windowStart}s - {windowStart + ws}s
        </small>
      </Card.Header>
      <Card.Body>
        <div style={{ overflowX: "auto", fontSize: "0.7em" }}>
          <Table striped bordered hover size="sm" style={{ fontSize: "0.8em" }}>
            <thead>
              <tr>
                <th>Persona</th>
                {allPPETypes.map(ppeType => (
                  <th key={ppeType} style={{ textAlign: "center" }}>
                    {getSpanishTitle(ppeType)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentResults.Persons.map((person, index) => (
                <tr key={index}>
                  <td>
                    <strong>{getPersonId(person, index)}</strong>
                  </td>
                  {allPPETypes.map(ppeType => {
                    const hasEquipment = hasPPE(person, ppeType);
                    return (
                      <td key={ppeType} style={{ textAlign: "center" }}>
                        {hasEquipment ? (
                          <span style={{ color: "#28a745", fontSize: "0.9em" }}>
                            ✅
                          </span>
                        ) : (
                          <span style={{ color: "#dc3545", fontSize: "0.9em" }}>
                            ❌
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        
        {/* Summary */}
        <div style={{ marginTop: "15px", padding: "10px", backgroundColor: "#f8f9fa", borderRadius: "4px" }}>
          <small className="text-muted">
            <strong>Leyenda:</strong> ✅ EPP Presente | ❌ EPP Faltante
          </small>
        </div>
      </Card.Body>
    </Card>
  );
};

export default PPEChart; 