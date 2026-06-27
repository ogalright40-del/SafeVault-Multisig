import React, { useState } from "react";

const EMPTY = { to: "", value: "", data: "0x" };

export default function SubmitForm({ onSubmit, loading }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.to || !/^0x[0-9a-fA-F]{40}$/.test(form.to))
      e.to = "Enter a valid Ethereum address";
    if (form.value !== "" && isNaN(parseFloat(form.value)))
      e.value = "Enter a valid ETH amount";
    if (parseFloat(form.value) < 0) e.value = "Value must be ≥ 0";
    if (form.data && form.data !== "0x" && !/^0x[0-9a-fA-F]*$/.test(form.data))
      e.data = "Must be valid hex data (0x…)";
    return e;
  };

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setErrors((err) => ({ ...err, [e.target.name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    await onSubmit(form.to, form.value || "0", form.data || "0x");
    setForm(EMPTY);
    setErrors({});
  };

  return (
    <section className="card submit-form">
      <h3 className="card__title">Submit Transaction</h3>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="to">
              Destination Address
            </label>
            <input
              id="to"
              name="to"
              className={`form-input mono ${errors.to ? "form-input--error" : ""}`}
              placeholder="0x..."
              value={form.to}
              onChange={handleChange}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.to && <span className="form-error">{errors.to}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="value">
              ETH Value
            </label>
            <input
              id="value"
              name="value"
              type="number"
              min="0"
              step="any"
              className={`form-input ${errors.value ? "form-input--error" : ""}`}
              placeholder="0.0"
              value={form.value}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.value && <span className="form-error">{errors.value}</span>}
          </div>

          <div className="form-group form-group--full">
            <label className="form-label" htmlFor="data">
              Call Data{" "}
              <span className="form-label__hint">(optional — for contract calls)</span>
            </label>
            <input
              id="data"
              name="data"
              className={`form-input mono ${errors.data ? "form-input--error" : ""}`}
              placeholder="0x"
              value={form.data}
              onChange={handleChange}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.data && <span className="form-error">{errors.data}</span>}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner" /> Submitting…
            </>
          ) : (
            "Submit Transaction"
          )}
        </button>
      </form>
    </section>
  );
}
