import "./styles.css";
import { AppController } from "./presentation/app-controller";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Не найден корневой элемент приложения");

void new AppController(root).start();

