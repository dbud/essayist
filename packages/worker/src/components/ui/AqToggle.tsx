/** The track and knob of a switch, for a row with the aq-toggle-row class. The row turns it on with
    the is-on class. */
export default function AqToggle() {
  return (
    <span class="aq-toggle" aria-hidden="true">
      <span class="aq-toggle-knob" />
    </span>
  );
}
