import { readFile } from "node:fs/promises";

export async function GetImages(): Promise<NonSharedBuffer[]> {
    const image1 = await readFile("./image1.png");
    const image2 = await readFile("./image2.png");

    return [image1, image2];
}

export function BaseImg (img: NonSharedBuffer): string {
    return img.toString('base64')
}


// while (true) {
//         setInterval(() => {
            
//         }, 2000)
//         setInterval(() => {

//         }, 2000)
//     }