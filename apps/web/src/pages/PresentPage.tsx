import { useParams } from "react-router";
import { Placeholder } from "./Placeholder.tsx";

export function PresentPage() {
  const { eventId } = useParams();
  return <Placeholder title="Präsentationsansicht">Event {eventId}. Kommt mit Meilenstein M6.</Placeholder>;
}
