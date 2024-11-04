# TypeORM - ADF Code Generator

Generator kode [ADF](https://github.com/Graf-Research/adf-core) untuk model [TypeORM](https://github.com/typeorm/typeorm) dalam format Typescript.

**Modul ADF yang digunakan**

`Table` `Enum`

**Penggunaan CLI (Command Line)**

```bash
npx @graf-research/adf-codegen-model-typeorm <file/url ADF> <folder output>
```

## Instalasi

```bash
npm install --save @graf-research/adf-codegen-model-typeorm
```

## Fungsi

```typescript
import { Model } from "@graf-research/adf-core";

type MapModelNameFilePath = {[key: string]: string};

interface CodegenFileOutput {
  filename: string
  content: string
}

interface ItemOutput {
  files: CodegenFileOutput[]
  map: MapModelNameFilePath
}

interface Output {
  table: ItemOutput
  enum: ItemOutput
}

function TypeORMModel.compile(list_model: Model.Item[]): Output
```

## Paduan TypeORM

Untuk menggunakan fitur auto generated-migration TypeORM konfigurasi antara data source harus sesuai. Pada generator ini kode yang di-generate akan muncul pada dua folder besar yaitu:
- &lt;folder output&gt;/model/table/*.ts
- &lt;folder output&gt;/model/enum/*.ts

Berikut salah satu contoh kofigurasi Data Source dan Script `package.json`

#### data-source.ts
```typescript
import { DataSource, DataSourceOptions } from "typeorm";
 
const config: DataSourceOptions = {
  type: "postgres",
  host: 'localhost',
  port: 5432,
  username: '<username>',
  password: '<password>',
  database: '<database name>',
  synchronize: false,
  logging: false,
  migrations: [
    __dirname + '/migration/**.ts'
  ],
  entities: [
    __dirname + '/<folder output>/model/**/*.{ts,js}'
  ]
};

export const AppDataSource = new DataSource(config);
```

#### package.json
```json
{
  ...
  "scripts": {
    ...
    "typeorm": "typeorm-ts-node-commonjs",
    "generate-migration": "npm run typeorm migration:generate -- $1 -d ./data-source.ts",
    "migrate": "npm run typeorm migration:run -- -d ./data-source.ts"
  },
  ...
}
```

##### Generate Migration

Untuk men-generate file migration TypeORM gunakan script `generate-migration` dengan output folder `migration` seperti konfigurasi pada `data-source.ts`, misalnya sebuah file migration dengan nama `Init.ts`:

```bash
npm run generate-migration migration/Init
```

akan menghasilkan file migration `migration/Init.ts`

##### Menjalankan Migration

Untuk menjalankan file migration TypeORM gunakan script `migrate`, contoh:

```bash
npm run migrate
```

akan mengeksekusi sql script dari file-file migration.
