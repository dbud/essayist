/** The track and knob of a switch, for a row with the toggle-row class. The row turns it on with
    the is-on class. */
export default function AqToggle() {
  return (
    <span class="toggle" aria-hidden="true">
      <span class="toggle-knob" />
    </span>
  );
}
