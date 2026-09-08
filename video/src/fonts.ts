/**
 * Font loading, once, for every composition.
 *
 * A bare loadFont() pulls every weight and every subset: 63 then 126 requests
 * for Roboto Condensed and 36 for DM Sans, repeated in each of the six render
 * tabs, for every game. That is slow, makes each render depend on the network,
 * and buries real errors under warning spam.
 *
 * The package only ever uses two weights of each family (400 body, 700 display)
 * and latin only, so ask for exactly that. The options object is built inline
 * per call rather than shared: the two families declare different `subsets`
 * unions, and a shared `as const` object is readonly where the API wants
 * mutable arrays.
 */
import { loadFont as loadRobotoCondensed } from "@remotion/google-fonts/RobotoCondensed";
import { loadFont as loadDMSans } from "@remotion/google-fonts/DMSans";

export const display = loadRobotoCondensed("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export const body = loadDMSans("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});
