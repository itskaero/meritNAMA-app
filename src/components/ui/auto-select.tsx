"use client";

import type { ComponentProps } from "react";

/** A select that submits its form as soon as it changes; the form's own button still works without script. */
export function AutoSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => { props.onChange?.(e); e.currentTarget.form?.requestSubmit(); }} />;
}
