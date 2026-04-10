import { ObjectId } from "mongodb";

export const toObjectIdArray = (ids: (string | ObjectId)[]): ObjectId[] => {
  return ids.map((id) =>
    typeof id === "string" ? new ObjectId(id) : id
  );
}