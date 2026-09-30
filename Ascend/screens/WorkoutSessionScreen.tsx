// WorkoutSessionScreen — reached only via WorkoutScreen's "Log another
// workout" button, once today's first session is already done. See
// components/WorkoutSession.tsx for why the actual logic lives there instead
// of here: this screen and WorkoutScreen's own inline "not done yet" view
// share the exact same body.
import { WorkoutSessionBody } from '../components/WorkoutSession';
import { safeGoBack } from '../utils/nav';

export default function WorkoutSessionScreen({ navigation }: any) {
  return <WorkoutSessionBody navigation={navigation} onBack={() => safeGoBack(navigation)} />;
}
