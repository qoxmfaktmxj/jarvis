import { getRequestConfig } from "next-intl/server";
import messages from "../messages/ko.json";

export default getRequestConfig(async () => ({ locale: "ko", messages }));
