import { CloseButton, closeModal } from '@/components/close-button';
import { Screen } from '@/components/screen';
import { TutorialSlides } from '@/components/tutorial-slides';

export default function TutorialScreen() {
  return (
    <Screen title="How it works" modal topAction={<CloseButton />}>
      <TutorialSlides onDone={closeModal} doneLabel="Done" />
    </Screen>
  );
}
