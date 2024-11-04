import _ from "lodash";
import { Model } from "@graf-research/adf-core";

export namespace TypeORMModel {
  export type MapModelNameFilePath = {[key: string]: string};
  export interface CodegenFileOutput {
    filename: string
    content: string
  }
  
  export interface ItemOutput {
    files: CodegenFileOutput[]
    map: MapModelNameFilePath
  }

  export interface Output {
    table: ItemOutput
    enum: ItemOutput
  }

  export function compile(list_model: Model.Item[]): Output {
    const list_table_output: ItemOutput[] = (list_model.filter(i => i.type === 'table') as Model.Table[]).map((t: Model.Table) => buildFromTable(t, list_model));
    const list_enume_output: ItemOutput[] = (list_model.filter(i => i.type === 'enum') as Model.Enum[]).map((t: Model.Enum) => buildFromEnum(t));
    
    return {
      table: {
        files: list_table_output.reduce((accumulator: CodegenFileOutput[], o: ItemOutput) => [...accumulator, ...o.files], []),
        map: list_table_output.reduce((accumulator: MapModelNameFilePath, o: ItemOutput) => ({ ...accumulator, ...o.map }), {})
      },
      enum: {
        files: list_enume_output.reduce((accumulator: CodegenFileOutput[], o: ItemOutput) => [...accumulator, ...o.files], []),
        map: list_enume_output.reduce((accumulator: MapModelNameFilePath, o: ItemOutput) => ({ ...accumulator, ...o.map }), {})
      }
    };
  }

  export function sqlTypeToJSType(type: Model.CommonSQLType.Types): string {
    switch (type.kind) {
      case "common":
        switch (type.type) {
          case 'text':
          case "varchar":
            return 'string';
          case 'int':
          case 'float':
          case 'bigint':
          case "tinyint":
          case "smallint":
          case "real":
          case "decimal":
            return 'number';
          case 'boolean':
            return 'boolean';
          case 'timestamp':
          case "date":
            return 'Date';
        }
      case "decimal":
        switch (type.type) {
          case 'decimal':
            return 'number';
        }
      case "chars":
        switch (type.type) {
          case 'varchar':
            return 'string';
        }
      case "enum":
        switch (type.type) {
          case 'enum':
            return type.enum_name;
        }
      case "relation":
        switch (type.type) {
          case 'relation':
            return type.table_name;
        }
    }
  }

  function getModelFileName(item: Model.Item, extension?: string): string {
    switch (item.type) {
      case "table": return `./model/table/${item.name}${extension ?? ''}`;
      case "enum": return `./model/enum/${item.name}${extension ?? ''}`;
    }
  }

  function buildTableDependency(table: Model.Table, list_model: Model.Item[]): string[] {
    return table.columns
      .filter((tc: Model.TableColumn) => tc.type.type === 'relation' || tc.type.type === 'enum')
      .map((tc: Model.TableColumn) => {
        const type = tc.type as (Model.CommonSQLType.Relation | Model.CommonSQLType.Enum);
        switch (type.type) {
          case 'enum': 
            const enum_item = list_model.find((m: Model.Item) => m.type === 'enum' && m.name === type.enum_name);
            if (!enum_item) {
              throw new Error(`Enum "${tc.name}" is not available on models`);
            }
            return `import { ${enum_item.name} } from '../.${getModelFileName(enum_item)}'`;
          case 'relation':
            const table_item = list_model.find((m: Model.Item) => m.type === 'table' && m.name === type.table_name);
            if (!table_item) {
              throw new Error(`Table "${tc.name}" is not available on models`);
            }
            return `import { ${table_item.name} } from '../.${getModelFileName(table_item)}'`;
        }
      });
  }

  function isIsoDate(str: string) {
    if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
    const d = new Date(str); 
    return !isNaN(d.getTime()) && d.toISOString() === str;
  }

  function getDefaultValue(default_value: Model.ColumnAttribute.DefaultValueType): string {
    switch (default_value.type) {
      case "string":
        return `'${default_value.data}'`;
      case "number":
        return String(default_value.data);
      case "boolean":
        return `'${String(default_value.data)}'`;
      case "enum":
        return `'${default_value.enum_value}'`;
    }
  }

  function buildColumnCommon(type: Model.CommonSQLType.Common, column: Model.TableColumn, list_model: Model.Item[]): string[] {
    const null_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'null');
    const default_value_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'default');
    const primary_key_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'primary-key');
    const unique_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'unique');
    const autoinc_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'autoincrement');
    const is_required = null_attr ? !null_attr.value : false;
    const has_default_value = Boolean(default_value_attr);

    const typeorm_decorator = [
      `@Column({`,
      ...[
        `type: '${type.type}',`,
        `nullable: ${is_required ? 'false' : 'true'},`,
        has_default_value ? `default: ${getDefaultValue(default_value_attr!.value)},` : ''
      ].filter(Boolean).map(line => '  ' + line),
      `})`,
    ];
    
    if (primary_key_attr?.value) {
      if (autoinc_attr?.value) {
        typeorm_decorator.push(`@PrimaryGeneratedColumn('increment')`);
      } else {
        typeorm_decorator.push(`@PrimaryColumn()`);
      }
    }

    if (unique_attr?.value) {
      // something to do with unique
    }

    return [
      ...typeorm_decorator,
      `${column.name}${is_required ? '!' : '?'}: ${sqlTypeToJSType(type)};`
    ];
  }

  function buildColumnDecimal(type: Model.CommonSQLType.Decimal, column: Model.TableColumn): string[] {
    const null_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'null');
    const default_value_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'default');
    const is_required = null_attr ? !null_attr.value : false;
    const has_default_value = Boolean(default_value_attr);

    const typeorm_decorator = [
      `@Column({`,
      ...[
        `type: '${type.type}',`,
        type.precision ? `precision: ${type.precision},` : '',
        type.scale ? `scale: ${type.scale},` : '',
        `nullable: ${is_required ? 'false' : 'true'},`,
        has_default_value ? `default: ${getDefaultValue(default_value_attr!.value)},` : ''
      ].filter(Boolean).map(line => '  ' + line),
      `})`,
    ]

    return [
      ...typeorm_decorator,
      `${column.name}${is_required ? '!' : '?'}: ${sqlTypeToJSType(type)};`
    ];
  }

  function buildColumnChars(type: Model.CommonSQLType.Chars, column: Model.TableColumn): string[] {
    const null_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'null');
    const default_value_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'default');
    const is_required = null_attr ? !null_attr.value : false;
    const has_default_value = Boolean(default_value_attr);

    const typeorm_decorator = [
      `@Column({`,
      ...[
        `type: '${type.type}',`,
        type.size ? `length: ${type.size},` : '',
        `nullable: ${is_required ? 'false' : 'true'},`,
        has_default_value ? `default: ${getDefaultValue(default_value_attr!.value)},` : ''
      ].filter(Boolean).map(line => '  ' + line),
      `})`,
    ]

    return [
      ...typeorm_decorator,
      `${column.name}${is_required ? '!' : '?'}: ${sqlTypeToJSType(type)};`
    ];
  }

  function buildColumnEnum(type: Model.CommonSQLType.Enum, column: Model.TableColumn): string[] {
    const null_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'null');
    const default_value_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'default');
    const is_required = null_attr ? !null_attr.value : false;
    const has_default_value = Boolean(default_value_attr);

    const typeorm_decorator = [
      `@Column({`,
      ...[
        `type: 'enum',`,
        `enum: ${type.enum_name},`,
        `nullable: ${is_required ? 'false' : 'true'},`,
        has_default_value ? `default: ${getDefaultValue(default_value_attr!.value)},` : ''
      ].filter(Boolean).map(line => '  ' + line),
      `})`,
    ]

    return [
      ...typeorm_decorator,
      `${column.name}${is_required ? '!' : '?'}: ${sqlTypeToJSType(type)};`
    ];
  }

  function buildColumnRelation(type: Model.CommonSQLType.Relation, column: Model.TableColumn, table: Model.Table, list_model: Model.Item[]): string[] {
    const null_attr = (column.attributes ?? []).find((attr: Model.ColumnAttribute.Attributes) => attr.type === 'null');
    const is_required = null_attr ? !null_attr.value : false;
    
    const foreign_table = list_model.find((item: Model.Item) => item.type === 'table' && item.name === type.table_name) as Model.Table | undefined;
    if (!foreign_table) {
      throw new Error(`Table "${type.table_name}" not found on relation "${table.name}.${column.name}"`);
    }
    const foreign_column = foreign_table.columns.find((fc: Model.TableColumn) => fc.name === type.foreign_key);
    if (!foreign_column) {
      throw new Error(`Column "${type.foreign_key}" on foreight table "${type.table_name}" not found on relation "${table.name}.${column.name}"`);
    }
    const one_to_many_field_name = `otm_${column.name}`;
    
    const typeorm_decorator = [
      `@ManyToOne(() => ${foreign_table.name}, x => x.${foreign_column.name}, { nullable: ${is_required ? 'false' : 'true'} })`,
      `@JoinColumn({ name: '${column.name}' })`,
      `${one_to_many_field_name}${is_required ? '!' : '?'}: ${foreign_table.name};`,
      `@Column({`,
      ...[
        `name: '${column.name}',`,
        `type: '${foreign_column.type.type}',`,
        `nullable: ${is_required ? 'false' : 'true'},`,
      ].filter(Boolean).map(line => '  ' + line),
      `})`,
    ]

    return [
      ...typeorm_decorator,
      `${column.name}${is_required ? '!' : '?'}: ${sqlTypeToJSType(foreign_column.type)};`
    ];
  }

  function buildColumn(column: Model.TableColumn, table: Model.Table, list_model: Model.Item[]): string[] {
    switch (column.type.kind) {
      case "common": return buildColumnCommon(column.type, column, list_model);
      case "decimal": return buildColumnDecimal(column.type, column);
      case "chars": return buildColumnChars(column.type, column);
      case "enum": return buildColumnEnum(column.type, column);
      case "relation": return buildColumnRelation(column.type, column, table, list_model);
    }
  }

  function buildFromTable(table: Model.Table, list_model: Model.Item[]): ItemOutput {
    return {
      files: [{
        filename: getModelFileName(table, '.ts'),
        content: [
          'import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn, BaseEntity } from "typeorm";',
          ..._.uniq(buildTableDependency(table, list_model)),
          '',
          `@Entity('${table.name}')`,
          `export class ${table.name} extends BaseEntity {`,
          ...table.columns
            .reduce((acc: string[], c: Model.TableColumn) => [...acc, ...buildColumn(c, table, list_model)], [])
            .map(line => '  ' + line),
          `}`
        ].join('\n')
      }],
      map: {
        [table.name]: getModelFileName(table)
      }
    }
  }

  function buildFromEnum(enume: Model.Enum): ItemOutput {
    return {
      files: [{
        filename: getModelFileName(enume, '.ts'),
        content: [
          `export enum ${enume.name} {`,
          ...enume.items
            .map(s => `'${s}' = '${s}',`)
            .map(line => '  ' + line),
          `};`
        ].join('\n')
      }],
      map: {
        [enume.name]: getModelFileName(enume)
      }
    };
  }
}
