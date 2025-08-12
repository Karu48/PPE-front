import React from "react";
import { Card } from "react-bootstrap";

import BoundingBox from "./BoundingBox";
import Icon from "./Icon";

const ProtectionCard = ({ person, webcamCoordinates }) => {
  // Define all required PPE for each person
  const allRequiredPPE = [
    { bodyPart: "cara", type: "Mascarilla", key: "FACE" },
    { bodyPart: "cabeza", type: "Casco", key: "HEAD" },
    { bodyPart: "mano izquierda", type: "Guante", key: "LEFT_HAND" },
    { bodyPart: "mano derecha", type: "Guante", key: "RIGHT_HAND" }
  ];

  // Create a map of detected PPE by body part
  const detectedPPE = {};
  person.results.forEach(result => {
    const bodyPartKey = result.bodyPart === "cara" ? "FACE" :
                       result.bodyPart === "cabeza" ? "HEAD" :
                       result.bodyPart === "mano izquierda" ? "LEFT_HAND" :
                       result.bodyPart === "mano derecha" ? "RIGHT_HAND" : null;
    
    if (bodyPartKey) {
      detectedPPE[bodyPartKey] = {
        type: result.type,
        confidence: result.confidence,
        coversBodyPart: result.coversBodyPart,
        coversBodyPartConfidence: result.coversBodyPartConfidence
      };
    }
  });

  // Check if all required PPE are present
  const allPPEPresent = allRequiredPPE.every(required => detectedPPE[required.key] !== undefined);

  // Hide the card if all PPE are present
  if (allPPEPresent) {
    return null;
  }

  return (
  <Card style={{ marginTop: "20px", textAlign: "left" }}>
      <Card.Header>
        <span>{`Persona #${person.id}`}</span>
      </Card.Header>
    <BoundingBox
        label={`Persona #${person.id}`}
      coordinates={person.boundingBox}
      webcamCoordinates={webcamCoordinates}
    />
    <Card.Body>
        <div style={{ marginTop: "15px" }}>
          <strong>Estado del EPP:</strong>
          <div style={{ marginTop: "10px" }}>
            {allRequiredPPE.map((required, index) => {
              const detected = detectedPPE[required.key];
              let isPresent = detected !== undefined;

              // Live per-window presence override (if available)
              const livePresence = person.ppeCompliance && person.ppeCompliance[required.key];
              if (livePresence) {
                isPresent = !!livePresence.present;
              }
              
              return (
                <div 
                  key={index} 
                  style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    marginBottom: "8px",
                    padding: "8px",
                    borderRadius: "4px",
                    backgroundColor: isPresent ? "#d4edda" : "#f8d7da",
                    border: `1px solid ${isPresent ? "#c3e6cb" : "#f5c6cb"}`
                  }}
                >
                  <Icon 
                    type={isPresent ? "success" : "fail"} 
                    size="16" 
                    style={{ marginRight: "8px" }}
                  />
                  <span style={{ flex: 1 }}>
                    <strong>{required.type}</strong> en {required.bodyPart}
                  </span>
                  {isPresent ? (
                    <div style={{ textAlign: "right", fontSize: "0.9em" }}>
                      <div style={{ color: "#155724" }}>
                        <strong>✅ Presente</strong>
                      </div>
                      {livePresence && (
                        <div style={{ color: "#155724", fontSize: "0.8em" }}>
                          Ventana: {Math.round(livePresence.percent)}% presente
                        </div>
                      )}
                      {detected && (
                        <>
                          <div style={{ color: "#155724", fontSize: "0.8em" }}>
                            Confianza: {detected.confidence}%
                          </div>
                          <div style={{ color: "#155724", fontSize: "0.8em" }}>
                            Cubre parte: {detected.coversBodyPart ? "Sí" : "No"} ({detected.coversBodyPartConfidence}%)
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                     <div style={{ textAlign: "right", fontSize: "0.9em" }}>
                      <div style={{ color: "#721c24" }}>
                        <strong>❌ Faltante</strong>
                      </div>
                      {livePresence && (
                        <div style={{ color: "#721c24", fontSize: "0.8em" }}>
                          Ventana: {Math.round(livePresence.percent)}% presente
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Show detected equipment with bounding boxes */}
      {person.results.map((r, index) => (
          <div key={index} style={{ marginTop: "10px" }}>
          <BoundingBox
            label={r.type}
            coordinates={r.boundingBox}
            webcamCoordinates={webcamCoordinates}
            color="#28a745"
          />
          </div>
      ))}
    </Card.Body>
  </Card>
);
};

export default ProtectionCard;
