import * as ec2 from '@aws-cdk/aws-ec2';
import * as kms from '@aws-cdk/aws-kms';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { Resource, Construct, Duration, Token, Annotations, RemovalPolicy, IResource } from '@aws-cdk/core';
import { IClusterEngine } from './cluster-engine';
import { DatabaseSecret } from './database-secret';
import { Endpoint } from './endpoint';
import { IParameterGroup } from './parameter-group';
import { applyRemovalPolicy } from './private/util';
import { Credentials, RotationMultiUserOptions } from './props';
import { CfnDBCluster } from './rds.generated';
import { ISubnetGroup, SubnetGroup } from './subnet-group';

/**
 *  Properties to configure an Aurora Serverless Cluster
 */
export interface ServerlessClusterProps {
  /**
   * What kind of database to start
   */
  readonly engine: IClusterEngine;

  /**
   * Credentials for the administrative user
   *
   * @default - A username of 'admin' and SecretsManager-generated password
   */
  readonly credentials: Credentials;

  /**
   * An optional identifier for the cluster
   *
   * @default - A name is automatically generated.
   */
  readonly clusterIdentifier?: string;

  /**
   * The number of days during which automatic DB snapshots are retained. Set
   * to zero to disable backups.
   *
   * @default Duration.days(1)
   */
  readonly backupRetention?: Duration;

  /**
   * Name of a database which is automatically created inside the cluster
   *
   * @default - Database is not created in cluster.
   */
  readonly defaultDatabaseName?: string;

  /**
   * Indicates whether the DB cluster should have deletion protection enabled.
   *
   * @default - true if removalPolicy is RETAIN, false otherwise
   */
  readonly deletionProtection?: boolean;

  /**
   * Whether to enable the HTTP endpoint for an Aurora Serverless database cluster
    *
   * @default false
   */
  readonly enableHttpEndpoint?: boolean;

  /**
   * The VPC that this Aurora Serverless cluster has been created in.
   */
  readonly vpc: ec2.IVpc;

  /**
   * Where to place the instances within the VPC
   *
   * @default - the VPC default strategy if not specified.
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * Scaling configuration
   *
   * @default - None
   */
  readonly scaling?: ServerlessScalingOptions;

  /**
   * The removal policy to apply when the cluster and its instances are removed
   * from the stack or replaced during an update.
   *
   * @default - RemovalPolicy.SNAPSHOT (remove the cluster and instances, but retain a snapshot of the data)
   */
  readonly removalPolicy?: RemovalPolicy;

  /**
   * Security group.
   *
   * @default - a new security group is created.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * The KMS key for storage encryption.
   *
   * @default - the default master key will be used for storage encryption
   */
  readonly storageEncryptionKey?: kms.IKey;

  /**
   * Additional parameters to pass to the database engine
   *
   * @default - no parameter group.
   */
  readonly parameterGroup?: IParameterGroup;

  /**
   * Existing subnet group for the cluster.
   *
   * @default - a new subnet group will be created.
   */
  readonly subnetGroup?: ISubnetGroup;
}

/**
  * Interface representing a serverless database cluster.
 */
export interface IServerlessCluster extends IResource, ec2.IConnectable, secretsmanager.ISecretAttachmentTarget {
  /**
   * Identifier of the cluster
   */
  readonly clusterIdentifier: string;

  /**
   * The endpoint to use for read/write operations
   * @attribute EndpointAddress,EndpointPort
   */
  readonly clusterEndpoint: Endpoint;

  /**
   * Endpoint to use for load-balanced read-only operations.
   * @attribute ReadEndpointAddress
   */
  readonly clusterReadEndpoint: Endpoint;
}

/**
 * Properties that describe an existing cluster instance
 */
export interface ServerlessClusterAttributes {
  /**
   * Identifier for the cluster
   */
  readonly clusterIdentifier: string;

  /**
   * The database port
   *
   * @default - none
   */
  readonly port?: number;

  /**
   * The security groups of the database cluster
   *
   * @default - no security groups
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Cluster endpoint address
   *
   * @default - no endpoint address
   */
  readonly clusterEndpointAddress?: string;

  /**
   * Reader endpoint address
   *
   * @default - no reader address
   */
  readonly readerEndpointAddress?: string;
}

/**
 * Aurora capacity units (ACUs).
 * Each ACU is a combination of processing and memory capacity.
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless.setting-capacity.html
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless.how-it-works.html#aurora-serverless.architecture
 */
export enum AuroraCapacityUnit {
  /**
   * 1 Aurora Capacity Unit
   */
  ACU_1 = 1,
  /**
   * 2 Aurora Capacity Units
   */
  ACU_2 = 2,
  /**
   * 8 Aurora Capacity Units
   */
  ACU_8 = 8,
  /**
   * 16 Aurora Capacity Units
   */
  ACU_16 = 16,
  /**
   * 32 Aurora Capacity Units
   */
  ACU_32 = 32,
  /**
   * 64 Aurora Capacity Units
   */
  ACU_64 = 64,
  /**
   * 128 Aurora Capacity Units
   */
  ACU_128 = 128,
  /**
   * 192 Aurora Capacity Units
   */
  ACU_192 = 192,
  /**
   * 256 Aurora Capacity Units
   */
  ACU_256 = 256,
  /**
   * 384 Aurora Capacity Units
   */
  ACU_384 = 384
}

/**
 * Options for configuring scaling on an Aurora Serverless cluster
 */
export interface ServerlessScalingOptions {
  /**
   * The minimum capacity for an Aurora Serverless database cluster.
   *
   * @default - determined by Aurora based on database engine
   */
  readonly minCapacity?: AuroraCapacityUnit;

  /**
   * The maximum capacity for an Aurora Serverless database cluster.
   *
   * @default - determined by Aurora based on database engine
   */
  readonly maxCapacity?: AuroraCapacityUnit;

  /**
   * The time before an Aurora Serverless database cluster is paused.
   * A database cluster can be paused only when it is idle (it has no connections).
   *
   * If a DB cluster is paused for more than seven days, the DB cluster might be
   * backed up with a snapshot. In this case, the DB cluster is restored when there
   * is a request to connect to it.
   *
   * Set to 0 to disable
   *
   * @default - automatic pause enabled after 5 minutes
   */
  readonly autoPause?: Duration;
}

/**
 * New or imported Serverless Cluster
 */
abstract class ServerlessClusterBase extends Resource implements IServerlessCluster {
  /**
   * Identifier of the cluster
   */
  public abstract readonly clusterIdentifier: string;

  /**
   * The endpoint to use for read/write operations
   */
  public abstract readonly clusterEndpoint: Endpoint;

  /**
   * The endpoint to use for read/write operations
   */
  public abstract readonly clusterReadEndpoint: Endpoint;

  /**
   * Access to the network connections
   */
  public abstract readonly connections: ec2.Connections;

  /**
   * Renders the secret attachment target specifications.
   */
  public asSecretAttachmentTarget(): secretsmanager.SecretAttachmentTargetProps {
    return {
      targetId: this.clusterIdentifier,
      targetType: secretsmanager.AttachmentTargetType.RDS_DB_CLUSTER,
    };
  }
}

/**
 * Create an Aurora Serverless Cluster
 *
 * @resource AWS::RDS::DBCluster
 */
export class ServerlessCluster extends ServerlessClusterBase {

  /**
   * Import an existing DatabaseCluster from properties
   */
  public static fromServerlessClusterAttributes(scope: Construct, id: string,
    attrs: ServerlessClusterAttributes): IServerlessCluster {

    return new ImportedServerlessCluster(scope, id, attrs);
  }

  public readonly clusterIdentifier: string;
  public readonly clusterEndpoint: Endpoint;
  public readonly clusterReadEndpoint: Endpoint;
  public readonly connections: ec2.Connections;

  /**
   * The secret attached to this cluster
   */
  public readonly secret?: secretsmanager.ISecret;

  protected readonly subnetGroup: ISubnetGroup;
  private readonly vpc: ec2.IVpc;
  private readonly vpcSubnets?: ec2.SubnetSelection;

  private readonly singleUserRotationApplication: secretsmanager.SecretRotationApplication;
  private readonly multiUserRotationApplication: secretsmanager.SecretRotationApplication;

  constructor(scope:Construct, id: string, props: ServerlessClusterProps) {
    super(scope, id);

    this.vpc = props.vpc;
    this.vpcSubnets = props.vpcSubnets;

    this.singleUserRotationApplication = props.engine.singleUserRotationApplication;
    this.multiUserRotationApplication = props.engine.multiUserRotationApplication;

    const { subnetIds } = this.vpc.selectSubnets(this.vpcSubnets);

    // Cannot test whether the subnets are in different AZs, but at least we can test the amount.
    if (subnetIds.length < 2) {
      Annotations.of(this).addError(`Cluster requires at least 2 subnets, got ${subnetIds.length}`);
    }

    this.subnetGroup = props.subnetGroup ?? new SubnetGroup(this, 'Subnets', {
      description: `Subnets for ${id} database`,
      vpc: props.vpc,
      vpcSubnets: props.vpcSubnets,
      removalPolicy: props.removalPolicy === RemovalPolicy.RETAIN ? props.removalPolicy : undefined,
    });

    let credentials = props.credentials ?? Credentials.fromUsername('admin');
    if (!credentials.secret && !credentials.password) {
      credentials = Credentials.fromSecret(new DatabaseSecret(this, 'Secret', {
        username: credentials.username,
        encryptionKey: credentials.encryptionKey,
      }));
    }
    const secret = credentials.secret;

    // bind the engine to the Cluster
    const clusterEngineBindConfig = props.engine.bindToCluster(this, {
      parameterGroup: props.parameterGroup,
    });
    const clusterParameterGroup = props.parameterGroup ?? clusterEngineBindConfig.parameterGroup;
    const clusterParameterGroupConfig = clusterParameterGroup?.bindToCluster({});

    const securityGroups = props.securityGroups ?? [
      new ec2.SecurityGroup(this, 'SecurityGroup', {
        description: 'RDS security group',
        vpc: this.vpc,
      }),
    ];

    const cluster = new CfnDBCluster(this, 'Resource', {
      backupRetentionPeriod: props.backupRetention?.toDays(),
      databaseName: props.defaultDatabaseName,
      dbClusterIdentifier: props.clusterIdentifier,
      dbClusterParameterGroupName: clusterParameterGroupConfig?.parameterGroupName,
      dbSubnetGroupName: this.subnetGroup.subnetGroupName,
      deletionProtection: props.deletionProtection,
      engine: props.engine.engineType,
      engineVersion: props.engine.engineVersion?.fullVersion,
      engineMode: 'serverless',
      enableHttpEndpoint: props.enableHttpEndpoint ?? false,
      kmsKeyId: props.storageEncryptionKey?.keyArn,
      masterUsername: credentials.username,
      masterUserPassword: credentials.password?.toString(),
      scalingConfiguration: props.scaling ? this.renderScalingConfiguration(props.scaling) : undefined,
      storageEncrypted: true,
      vpcSecurityGroupIds: securityGroups.map(sg => sg.securityGroupId),
    });

    this.clusterIdentifier = cluster.ref;

    // create a number token that represents the port of the cluster
    const portAttribute = Token.asNumber(cluster.attrEndpointPort);
    this.clusterEndpoint = new Endpoint(cluster.attrEndpointAddress, portAttribute);
    this.clusterReadEndpoint = new Endpoint(cluster.attrReadEndpointAddress, portAttribute);
    this.connections = new ec2.Connections({
      securityGroups,
      defaultPort: ec2.Port.tcp(this.clusterEndpoint.port),
    });

    applyRemovalPolicy(cluster, props.removalPolicy);

    if (secret) {
      this.secret = secret.attach(this);
    }
  }

  /**
   * Adds the single user rotation of the master password to this cluster.
   *
   * @param [automaticallyAfter=Duration.days(30)] Specifies the number of days after the previous rotation
   * before Secrets Manager triggers the next automatic rotation.
   */
  public addRotationSingleUser(automaticallyAfter?: Duration): secretsmanager.SecretRotation {
    if (!this.secret) {
      throw new Error('Cannot add single user rotation for a cluster without secret.');
    }

    const id = 'RotationSingleUser';
    const existing = this.node.tryFindChild(id);
    if (existing) {
      throw new Error('A single user rotation was already added to this cluster.');
    }

    return new secretsmanager.SecretRotation(this, id, {
      secret: this.secret,
      automaticallyAfter,
      application: this.singleUserRotationApplication,
      vpc: this.vpc,
      vpcSubnets: this.vpcSubnets,
      target: this,
    });
  }

  /**
   * Adds the multi user rotation to this cluster.
   */
  public addRotationMultiUser(id: string, options: RotationMultiUserOptions): secretsmanager.SecretRotation {
    if (!this.secret) {
      throw new Error('Cannot add multi user rotation for a cluster without secret.');
    }
    return new secretsmanager.SecretRotation(this, id, {
      secret: options.secret,
      masterSecret: this.secret,
      automaticallyAfter: options.automaticallyAfter,
      application: this.multiUserRotationApplication,
      vpc: this.vpc,
      vpcSubnets: this.vpcSubnets,
      target: this,
    });
  }

  private renderScalingConfiguration(options: ServerlessScalingOptions): CfnDBCluster.ScalingConfigurationProperty {
    const minCapacity = options.minCapacity;
    const maxCapacity = options.maxCapacity;

    if (minCapacity && maxCapacity && minCapacity > maxCapacity) {
      throw new Error('maximum capacity must be greater than or equal to minimum capacity.');
    }

    return {
      autoPause: (options.autoPause?.toSeconds() === 0) ? false : true,
      minCapacity: options.minCapacity,
      maxCapacity: options.maxCapacity,
      secondsUntilAutoPause: options.autoPause?.toSeconds(),
    };
  }
}

/**
 * Represents an imported database cluster.
 */
class ImportedServerlessCluster extends ServerlessClusterBase implements IServerlessCluster {
  public readonly clusterIdentifier: string;
  public readonly connections: ec2.Connections;

  private readonly _clusterEndpoint?: Endpoint;
  private readonly _clusterReadEndpoint?: Endpoint;

  constructor(scope: Construct, id: string, attrs: ServerlessClusterAttributes) {
    super(scope, id);

    this.clusterIdentifier = attrs.clusterIdentifier;

    const defaultPort = attrs.port ? ec2.Port.tcp(attrs.port) : undefined;
    this.connections = new ec2.Connections({
      securityGroups: attrs.securityGroups,
      defaultPort,
    });

    this._clusterEndpoint = (attrs.clusterEndpointAddress && attrs.port) ? new Endpoint(attrs.clusterEndpointAddress, attrs.port) : undefined;
    this._clusterReadEndpoint = (attrs.readerEndpointAddress && attrs.port) ? new Endpoint(attrs.readerEndpointAddress, attrs.port) : undefined;
  }

  public get clusterEndpoint() {
    if (!this._clusterEndpoint) {
      throw new Error('Cannot access `clusterEndpoint` of an imported cluster without an endpoint address and port');
    }
    return this._clusterEndpoint;
  }

  public get clusterReadEndpoint() {
    if (!this._clusterReadEndpoint) {
      throw new Error('Cannot access `clusterReadEndpoint` of an imported cluster without a readerEndpointAddress and port');
    }
    return this._clusterReadEndpoint;
  }
}
