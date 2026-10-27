import { useParams } from "react-router";
import { Placeholder } from "./Placeholder.tsx";

export function JoinPage() {
  const { slug } = useParams();
  return <Placeholder title="Willkommen bei CoMatch">Event „{slug}“. Kommt mit Meilenstein M2.</Placeholder>;
}
