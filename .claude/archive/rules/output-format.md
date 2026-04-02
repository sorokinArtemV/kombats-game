# Required Output Format

## Audit Mode Output

Always return:

1. Confirmed findings
2. Inferred risks
3. File / class / method references
4. Why each issue violates the integration spec
5. Severity
6. Recommended next implementation batch

Do not mix confirmed findings and assumptions.

Use this structure:

### Confirmed findings
- finding
- evidence
- impact
- severity

### Inferred risks
- risk
- why it is likely
- what must be checked

### Recommended batches
- batch name
- scope
- why this order

---

## Implementation Mode Output

Always return:

1. What changed
2. Why it changed
3. What was intentionally not changed
4. Remaining known gaps
5. Transitional / migration notes
6. Risks introduced or left unresolved

Use this structure:

### Implemented
### Intentionally not changed
### Remaining gaps
### Transitional notes
### Risks

---

## Review Mode Output

Always return:

1. What looks correct
2. What is still incomplete
3. Boundary violations
4. Regression risks
5. Cleanup candidates

Use this structure:

### Correct
### Incomplete
### Boundary violations
### Regression risks
### Cleanup candidates