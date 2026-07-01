export class FilterIndex {
  private eqIndex: Map<string, Map<unknown, Set<string>>> = new Map();
  private rangeIndex: Map<string, Array<{ value: number; docId: string }>> = new Map();
  private docFields: Map<string, Map<string, Set<unknown>>> = new Map();

  add(docId: string, field: string, value: unknown): void {
    if (!this.docFields.has(docId)) {
      this.docFields.set(docId, new Map());
    }
    const fieldValues = this.docFields.get(docId)!;
    if (!fieldValues.has(field)) {
      fieldValues.set(field, new Set());
    }
    fieldValues.get(field)!.add(value);

    if (!this.eqIndex.has(field)) {
      this.eqIndex.set(field, new Map());
    }
    const eqField = this.eqIndex.get(field)!;
    if (!eqField.has(value)) {
      eqField.set(value, new Set());
    }
    eqField.get(value)!.add(docId);

    const num = Number(value);
    if (!isNaN(num)) {
      if (!this.rangeIndex.has(field)) {
        this.rangeIndex.set(field, []);
      }
      this.rangeIndex.get(field)!.push({ value: num, docId });
    }
  }

  remove(docId: string, field: string, value: unknown): void {
    const eqField = this.eqIndex.get(field);
    if (eqField) {
      const valueSet = eqField.get(value);
      if (valueSet) {
        valueSet.delete(docId);
        if (valueSet.size === 0) eqField.delete(value);
      }
    }

    const num = Number(value);
    if (!isNaN(num)) {
      const rangeField = this.rangeIndex.get(field);
      if (rangeField) {
        const idx = rangeField.findIndex(e => e.docId === docId && e.value === num);
        if (idx !== -1) rangeField.splice(idx, 1);
      }
    }
  }

  removeDoc(docId: string): void {
    const fieldValues = this.docFields.get(docId);
    if (fieldValues) {
      for (const [field, values] of fieldValues) {
        for (const value of values) {
          this.remove(docId, field, value);
        }
      }
    }
    this.docFields.delete(docId);
  }

  getEq(field: string, value: unknown): Set<string> | undefined {
    return this.eqIndex.get(field)?.get(value);
  }

  getRange(
    field: string,
    min?: number,
    max?: number,
    includeMin = true,
    includeMax = true
  ): Set<string> {
    const arr = this.rangeIndex.get(field);
    if (!arr || arr.length === 0) return new Set();

    arr.sort((a, b) => a.value - b.value || a.docId.localeCompare(b.docId));

    const len = arr.length;
    let lo = 0;
    let hi = len - 1;

    if (min !== undefined) {
      let l = 0;
      let r = len;
      while (l < r) {
        const m = (l + r) >> 1;
        if (arr[m].value < min) l = m + 1;
        else r = m;
      }
      if (!includeMin) {
        while (l < len && arr[l].value === min) l++;
      }
      lo = l;
    }

    if (max !== undefined) {
      let l = 0;
      let r = len;
      while (l < r) {
        const m = (l + r) >> 1;
        if (arr[m].value <= max) l = m + 1;
        else r = m;
      }
      hi = l - 1;
      if (!includeMax) {
        while (hi >= 0 && arr[hi].value === max) hi--;
      }
    }

    if (lo > hi) return new Set();

    const result = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      result.add(arr[i].docId);
    }
    return result;
  }

  getExists(field: string): Set<string> {
    const eqField = this.eqIndex.get(field);
    if (!eqField) return new Set();
    const result = new Set<string>();
    for (const valueSet of eqField.values()) {
      for (const docId of valueSet) {
        result.add(docId);
      }
    }
    return result;
  }

  getFieldValues(docId: string, field: string): Set<unknown> {
    return this.docFields.get(docId)?.get(field) ?? new Set();
  }

  getAllDocIds(): Set<string> {
    return new Set(this.docFields.keys());
  }

  clear(): void {
    this.eqIndex.clear();
    this.rangeIndex.clear();
    this.docFields.clear();
  }
}
