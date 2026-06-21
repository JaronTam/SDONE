import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    "C:/Users/Jaron/AppData/Local/Vivaldi/Application/vivaldi.exe",
  headless: false,
  args: ["--no-sandbox", "--disable-gpu", "--remote-debugging-port=0"],
});
