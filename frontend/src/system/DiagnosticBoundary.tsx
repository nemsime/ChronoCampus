import { Component, ReactNode } from "react";
import { reportClientError } from "./api";

export class DiagnosticBoundary extends Component<
  { children: ReactNode; message: string; reload: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    reportClientError("render_error", error);
  }
  render() {
    return this.state.failed ? (
      <section className="panel notice error" role="alert">
        <p>{this.props.message}</p>
        <button onClick={() => window.location.reload()}>
          {this.props.reload}
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
