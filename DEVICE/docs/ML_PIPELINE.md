# ML Pipeline

Status: planned only.

The planned ML pipeline may classify fatigue-related observations such as prolonged eye closure, repeated gaze-away patterns or non-response to warnings. It must report confidence, model version, timestamp and sensor context.

Model output must be treated as probabilistic. False positives and false negatives are expected risks. The APP safety workflow decides whether an observation becomes a safety signal, suspected incident or confirmed incident.

Raw media retention should be disabled by default unless a tenant has explicit policy, consent and legal basis.
